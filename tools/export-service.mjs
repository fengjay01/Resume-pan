/**
 * 本地无损导出服务（零依赖，复刻小林简历的「服务端渲染 PDF」架构）。
 *
 * 背景：浏览器里只有一套排版引擎，前端自绘 PDF 做不到 100%（自绘方案已下线）。
 * 小林简历的做法是前端把简历数据 POST 给服务端，由**服务端**用无头 Chrome
 * 排版并生成 PDF 后回传。本服务用零依赖的方式复刻同一条链路：
 *
 *   前端 buildPrintDocument(root) 产出带完整样式/字体引用的独立 HTML
 *     → POST /export
 *   本服务把 HTML 挂到 http://127.0.0.1:<port>/job/<id>（应用静态资源反代成同源，
 *   字体才能加载），启动系统 Chrome（headless）走 CDP `Page.printToPDF`
 *     → 返回 PDF 字节（矢量、文字可选中、与预览同一排版引擎 → 无损一致）
 *
 * 启动：node tools/export-service.mjs [--port=8790] [--app=http://127.0.0.1:5173]
 * 前端会自动探测该服务（GET /ping），可用则导出菜单优先走它。
 * dev 模式下 vite 插件会自动拉起本服务（见 app/vite.config.ts）。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
const PORT = Number(args.port || 8790);
const APP_ORIGIN = (args.app || 'http://127.0.0.1:5173').replace(/\/$/, '');
const CHROME = args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/**
 * 给 printToPDF 产物写入 Info /Keywords（导入时靠它 1:1 还原简历）。
 *
 * 不用 pdf-lib：项目已彻底移除 pdf-lib 依赖（自绘矢量方案下线），这里改用
 * **PDF 增量更新**的标准做法——原文不动，末尾追加一个 Info 对象和新的
 * trailer/startxref，阅读器永远以最后一个 startxref 为准，新旧结构都合法。
 * 手术失败就原样返回（导入端还有文本结构解析兜底），绝不影响导出本身。
 */
function injectResumeMetadata(pdf, payload) {
  if (!payload) return pdf;
  try {
    const text = pdf.toString('latin1');
    if (text.lastIndexOf('startxref') < 0) return pdf;
    // 原 trailer 的 /Root 引用必须带进新 trailer（规范要求最后一个 trailer 有 Root）
    const rootMatch = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(text);
    if (!rootMatch) return pdf;
    const objNum = 9999001; // 远离 Chrome 生成的对象号，避免撞号
    // base64 载荷只含 A-Za-z0-9+/=，这里仍按规范转义字面量字符串
    const escaped = payload.replace(/[\\()]/g, (c) => `\\${c}`);
    const appendOffset = pdf.length;
    const addition = Buffer.from(
      `${objNum} 0 obj\n<< /Keywords (${escaped}) >>\nendobj\n` +
        `trailer\n<< /Size ${objNum + 1} /Root ${rootMatch[1]} ${rootMatch[2]} R ` +
        `/Info ${objNum} 0 R >>\nstartxref\n${appendOffset}\n%%EOF\n`,
      'latin1',
    );
    return Buffer.concat([pdf, addition]);
  } catch (e) {
    console.error('[export-service] 元数据注入失败（不影响导出）：', String(e).slice(0, 160));
    return pdf;
  }
}

const jobs = new Map(); // '/job/<id>' -> html
let jobSeq = 0;

/* ------------------------------- 反向代理应用资源 ------------------------------- */
async function proxy(appPath, res) {
  try {
    const upstream = await fetch(APP_ORIGIN + appPath);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(buf);
  } catch (e) {
    console.error('[export-service] proxy 失败:', APP_ORIGIN + appPath, String(e));
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('proxy error');
  }
}

/* ---------------------------------- Chrome CDP ---------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(debugPort, userDataDir) {
  return spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--hide-scrollbars', '--no-proxy-server',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`,
      '--window-size=900,1300', 'about:blank',
    ],
    { stdio: 'ignore' },
  );
}

async function getTarget(port) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('无法连接 Chrome DevTools');
}

class Cdp {
  constructor(ws, sessionId) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = (this.seq += 1);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (this.sessionId) payload.sessionId = this.sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
}

/** 用无头 Chrome 把 HTML 打成 PDF（与预览同一排版引擎） */
async function renderPdf(jobUrl) {
  const dir = mkdtempSync(path.join(tmpdir(), 'xl-export-'));
  const debugPort = 9300 + Math.floor(Math.random() * 400);
  const chrome = launchChrome(debugPort, dir);
  let pdf = null;
  try {
    const target = await getTarget(debugPort);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const browser = new Cdp(ws);
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.id, flatten: true });
    const page = new Cdp(ws, sessionId);

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 794, height: 1123, deviceScaleFactor: 1, mobile: false,
    });
    await page.send('Page.navigate', { url: jobUrl });
    // 等待文档与资源就绪（与前端打印流程一致：字体 → 图片 → 再等一轮字体）
    const ready = await page.send('Runtime.evaluate', {
      expression: `(async () => {
        for (let i = 0; i < 100; i += 1) {
          if (document.readyState === 'complete' && document.querySelector('.resume-page')) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        try { await document.fonts.ready; } catch {}
        await Promise.all(Array.from(document.images).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
        try { await document.fonts.ready; } catch {}
        await new Promise((r) => setTimeout(r, 350));
        // 诊断：字体面数与「已加载状态」——回退字体时 status 仍是 loaded 但字形不对，
        // 所以额外记录实际用到的 family 是否在 document.fonts 里注册过
        const families = new Set();
        for (const f of Array.from(document.fonts)) families.add(f.family + '/' + f.weight + '/' + f.status);
        let faceRules = 0;
        let sheetCount = 0;
        for (const sheet of Array.from(document.styleSheets)) {
          sheetCount += 1;
          try { for (const r of Array.from(sheet.cssRules)) if (r.type === 5) faceRules += 1; } catch {}
        }
        const used = new Set();
        document.querySelectorAll('.resume-page *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (el.textContent && el.textContent.trim()) used.add(cs.fontFamily.split(',')[0].replace(/["']/g, ''));
        });
        return JSON.stringify({
          pages: document.querySelectorAll('.resume-page').length,
          readyState: document.readyState,
          sheetCount, faceRules,
          fontFaces: families.size,
          faces: Array.from(families).slice(0, 30),
          usedFamilies: Array.from(used).slice(0, 10),
        });
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (process.env.XL_EXPORT_DEBUG) {
      console.error('[export-service] job ready:', ready.result?.value);
    }

    const out = await page.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
    });
    pdf = Buffer.from(out.data, 'base64');
    ws.close();
  } finally {
    try { chrome.kill(); } catch { /* ignore */ }
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }, 3000);
  }
  if (!pdf || !pdf.length) throw new Error('printToPDF 未返回数据');
  return pdf;
}

/* ------------------------------------ HTTP 服务 ------------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, app: APP_ORIGIN }));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/job/')) {
    const job = jobs.get(url.pathname);
    if (!job) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(job);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/proxy/')) {
    await proxy(decodeURIComponent(url.pathname.slice('/proxy'.length)), res);
    return;
  }

  /* catch-all：其余路径一律反代到应用。
     为什么必须：dev 模式 vite 把 @font-face 的 src 写成**根相对路径**（/node_modules/...），
     它只认 origin 不认 <base href> 的路径 —— 只改写绝对地址（旧实现）时这些请求会打到
     本服务 origin 上 404，字体全回退 → 导出字形与预览完全不同（IoU 49%）。
     生产构建的 <link>/相对 url 也一并覆盖。 */
  if (req.method === 'GET') {
    await proxy(url.pathname + (url.search || ''), res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/export') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { html, filename, payload } = JSON.parse(body);
        if (!html) throw new Error('missing html');
        // 应用绝对地址改写成同源反代地址，字体/样式才能在 job 页里加载
        const rewritten = html.split(APP_ORIGIN).join(`http://127.0.0.1:${PORT}/proxy`);
        const id = `j${(jobSeq += 1)}-${Date.now().toString(36)}`;
        jobs.set(`/job/${id}`, rewritten);
        setTimeout(() => jobs.delete(`/job/${id}`), 120000);
        let pdf = await renderPdf(`http://127.0.0.1:${PORT}/job/${id}`);
        // 完整简历数据注入 PDF 元数据（导入 1:1 还原用）；正文文本保持干净
        if (payload) {
          try {
            pdf = injectResumeMetadata(pdf, payload);
          } catch (e) {
            console.error('[export-service] 元数据注入失败：', String(e).slice(0, 160));
          }
        }
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename || '简历')}.pdf"`,
          'Access-Control-Allow-Origin': '*',
          // 调试用： job 页地址（XL_EXPORT_DEBUG=1 时才带，正常导出无感）
          ...(process.env.XL_EXPORT_DEBUG ? { 'X-Job-Url': `http://127.0.0.1:${PORT}/job/${id}` } : {}),
        });
        res.end(pdf);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[export-service] http://127.0.0.1:${PORT}   （反代 ${APP_ORIGIN}）`);
});

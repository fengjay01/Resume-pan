/**
 * 三种导出模式端到端对比：
 *  ① 浏览器导出（渲染服务 printToPDF，矢量无损） ② 图片导出（3x 栅格化）
 * 各自与「浏览器真实渲染基准」（CDP 截屏）做逐页墨迹对比。
 *
 * 用法：node tools/all-modes-fidelity.mjs --seed=... --id=<resume-id> --out=shots/all3
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const SEED = path.resolve(arg('seed', 'tools/seeds/seed-multi.json'));
const OUT = path.resolve(arg('out', 'shots/all3'));
const APP = arg('url', 'http://127.0.0.1:5173');
const RID = arg('id', 'sample-resume');
const PAGE_W = 794;
const PAGE_H = 1123;

mkdirSync(OUT, { recursive: true });

const userDataDir = path.join(process.env.TEMP || '/tmp', 'cdp-all3-' + Date.now());
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--force-device-scale-factor=1', '--hide-scrollbars',
  '--no-proxy-server', '--proxy-bypass-list=<-loopback>',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1500,1400', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pages[0]) return pages[0];
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome DevTools');
}
const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
function send(method, params = {}) {
  msgId += 1;
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
async function goto(url) {
  const origin = new URL(url).origin;
  for (let i = 0; i < 8; i += 1) {
    await send('Page.navigate', { url }).catch(() => {});
    await sleep(1200);
    const href = await evaluate('location.href').catch(() => '');
    if (String(href).startsWith(origin)) { await sleep(400); return String(href); }
  }
  throw new Error('导航失败：' + url.slice(0, 60));
}

await send('Page.enable');
await send('Runtime.enable');

/* ---- ① 种子 + 编辑器 ---- */
await goto(`${APP}/resumes`);
const seed = JSON.parse(readFileSync(SEED, 'utf8'));
await evaluate(`(async () => {
  const seed = ${JSON.stringify(seed)};
  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  return 'ok';
})()`);
await goto(`${APP}/editor/${RID}`);
await sleep(3200);
await evaluate('document.fonts.ready.then(() => true)');
await sleep(600);

/* ---- ② 离屏导出根元数据 ---- */
const meta = await evaluate(`(() => {
  const root = Array.from(document.querySelectorAll('div')).find((d) => d.style.left === '-99999px');
  if (!root) return null;
  const pages = Array.from(root.querySelectorAll('.resume-page'));
  const rr = root.getBoundingClientRect();
  return {
    n: pages.length,
    offsets: pages.map((p) => {
      const r = p.getBoundingClientRect();
      return { dx: r.left - rr.left, dy: r.top - rr.top, w: r.width, h: r.height };
    }),
  };
})()`);
if (!meta) throw new Error('未找到离屏导出根');
console.log(`页数: ${meta.n}`);

/* ---- ③ 三模式导出 ---- */
const evalSrc = readFileSync(path.resolve('tools/all-modes-check.eval.js'), 'utf8');
const raw = await evaluate(`(() => { window.__RID = ${JSON.stringify(RID)}; return 'ok'; })()`);
const built = await evaluate(evalSrc);
if (!built) throw new Error('导出评测失败');
const res3 = JSON.parse(built);
console.log('导出结果:', JSON.stringify({
  pages: res3.pages,
  service: res3.service, image: res3.image,
}, null, 1));

if (res3.serviceB64) writeFileSync(path.join(OUT, 'service.pdf'), Buffer.from(res3.serviceB64, 'base64'));
if (res3.imageB64) writeFileSync(path.join(OUT, 'image.pdf'), Buffer.from(res3.imageB64, 'base64'));

/* ---- ④ 黄金基准：逐页 CDP 截屏 ---- */
await evaluate(`(async () => {
  const root = Array.from(document.querySelectorAll('div')).find((d) => d.style.left === '-99999px');
  window.__prev = { parent: root.parentElement, next: root.nextSibling, left: root.style.left, top: root.style.top, z: root.style.zIndex };
  document.body.appendChild(root);
  root.style.left = '0px';
  root.style.top = '0px';
  root.style.zIndex = '9999';
  document.getElementById('root').style.visibility = 'hidden';
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
  return 'moved';
})()`);
const refDataUrls = [];
for (let i = 0; i < meta.n; i += 1) {
  const off = meta.offsets[i];
  await evaluate(`(() => {
    const root = Array.from(document.querySelectorAll('div')).find((d) => d.style.left === '0px' && d.style.zIndex === '9999');
    root.style.top = '${(-off.dy).toFixed(2)}px';
    root.style.left = '${(-off.dx).toFixed(2)}px';
    return 'ok';
  })()`);
  await sleep(180);
  const s = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: PAGE_W, height: PAGE_H, scale: 1 },
  });
  refDataUrls.push('data:image/png;base64,' + s.data);
  writeFileSync(path.join(OUT, `ref-p${i + 1}.png`), Buffer.from(s.data, 'base64'));
}
await evaluate(`(() => {
  const root = Array.from(document.querySelectorAll('div')).find((d) => d.style.zIndex === '9999');
  const p = window.__prev;
  p.parent.insertBefore(root, p.next);
  root.style.left = p.left; root.style.top = p.top; root.style.zIndex = p.z;
  document.getElementById('root').style.visibility = '';
  return 'restored';
})()`);
console.log(`基准截屏 ${refDataUrls.length} 页`);

/* ---- ⑤ 三份 PDF 与基准对比 ---- */
await goto(`${APP}/resumes`);
await sleep(1500);
const cmp = await evaluate(`(async () => {
  const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
  const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const refs = ${JSON.stringify(refDataUrls)};
  const files = {
    service: ${JSON.stringify(res3.serviceB64 || '')},
    image: ${JSON.stringify(res3.imageB64 || '')},
  };
  const out = {};
  for (const [name, b64] of Object.entries(files)) {
    if (!b64) { out[name] = null; continue; }
    const raw = atob(b64);
    const u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) u8[i] = raw.charCodeAt(i);
    const doc = await pdfjs.getDocument({ data: u8, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: ${PAGE_W} / vp0.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
      const tc = await page.getTextContent();
      const textLen = tc.items.reduce((n, it) => n + String(it.str).length, 0);
      const refImg = new Image();
      await new Promise((r, j) => { refImg.onload = r; refImg.onerror = j; refImg.src = refs[p - 1] || refs[0]; });
      const W = Math.min(c.width, refImg.width); const H = Math.min(c.height, refImg.height);
      const a = c.getContext('2d').getImageData(0, 0, W, H).data;
      const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
      bc.getContext('2d').drawImage(refImg, 0, 0, W, H);
      const b = bc.getContext('2d').getImageData(0, 0, W, H).data;
      const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const T = 170;
      let hit = 0, miss = 0, extra = 0;
      for (let i = 0; i < W * H; i += 1) {
        const ia = lum(a, i * 4) < T;
        const ib = lum(b, i * 4) < T;
        if (ia && ib) hit += 1;
        else if (ib) miss += 1;
        else if (ia) extra += 1;
      }
      pages.push({
        page: p, textLen,
        recall: +(100 * hit / (hit + miss || 1)).toFixed(2),
        precision: +(100 * hit / (hit + extra || 1)).toFixed(2),
        iou: +(100 * hit / (hit + miss + extra || 1)).toFixed(2),
      });
    }
    out[name] = { numPages: doc.numPages, pages };
    try { if (typeof doc.destroy === 'function') doc.destroy(); } catch { /* ignore */ }
  }
  return JSON.stringify(out);
})()`);
for (const [name, r] of Object.entries(JSON.parse(cmp))) {
  if (!r) { console.log(`${name}: 未生成`); continue; }
  for (const p of r.pages) {
    console.log(`${name} 第${p.page}页: 文本 ${p.textLen} 字 | 召回 ${p.recall}% 精确 ${p.precision}% IoU ${p.iou}%`);
  }
}
console.log('落图目录:', OUT);
ws.close();
chrome.kill();
process.exit(0);

/**
 * 「导出 → 导入」往返一致性测试（零依赖，复用 shot.mjs 的 CDP 思路）。
 *
 * 流程：
 *  1. 打开应用，从种子里取一份简历，用**真实的导出代码**（buildPrintDocument）
 *    生成打印 HTML，payload 交给渲染服务写进 PDF 元数据；
 *  2. POST 本地渲染服务（无头 Chrome printToPDF，与用户点「浏览器导出」同路）出 PDF；
 *  3. 把 PDF 喂给**真实的导入代码**（readResumeFile），拿到恢复出来的简历；
 *  4. 与原简历逐字段对比（忽略自动生成的 id 与时间戳）。
 *
 * 用法：node tools/roundtrip.mjs（需渲染服务在跑；dev 模式 vite 插件会自动拉起）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'http://127.0.0.1:5173/resumes';
const SEED = path.resolve('tools/seeds/seed-multi.json');
const WORKDIR = mkdtempSync(path.join(tmpdir(), 'xl-roundtrip-'));

const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-rt-'));
const port = 9800 + Math.floor(Math.random() * 300);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1400,900',
    APP_URL,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const pick = pages.find((t) => String(t.url).startsWith('http://127.0.0.1:5173')) || pages[0];
      if (pick) return pick;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome DevTools');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

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
  const id = msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

async function goto(targetUrl) {
  for (let i = 0; i < 6; i += 1) {
    await send('Page.navigate', { url: targetUrl });
    await sleep(1200);
    const href = await evaluate('location.href');
    if (String(href).startsWith(targetUrl.split('#')[0])) return;
  }
  throw new Error('导航失败：' + targetUrl);
}

/* ------------------------------- ① 准备种子 ------------------------------- */
const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const seedScript =
  'for (const [k, v] of Object.entries(' +
  JSON.stringify(JSON.stringify(seed)) +
  ')) {} '; // 占位，下面直接写 localStorage
void seedScript;

await goto(APP_URL);
// 写入种子（resumes[0] 作为被测对象）
const resumeJson = await evaluate(
  `(async () => {
    const seed = ${JSON.stringify(seed)};
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
    return 'seeded';
  })()`,
);
await goto(APP_URL);
await sleep(1500);

/* ------------------- ② 用真实导出链路生成 PDF（本地渲染服务） ------------------- */
// 与用户点击「浏览器导出」完全同路：buildPrintDocument → POST 渲染服务 →
// 无头 Chrome printToPDF + 元数据注入（完整简历数据写进 /Keywords）。
// 服务没起时给明确指引（dev 模式下 vite 插件会自动拉起它）。
const servicePing = await fetch('http://127.0.0.1:8790/ping').catch(() => null);
if (!servicePing?.ok) {
  console.error('✗ 本地渲染服务未启动（127.0.0.1:8790）。dev 模式下应由 vite 插件自动拉起；' +
    '手动启动：node tools/export-service.mjs');
  process.exit(1);
}
const build = await evaluate(
  `(async () => {
    const seed = ${JSON.stringify(seed)};
    const resume = seed['xl-resume-data'].state.resumes[0];
    const { buildPrintDocument } = await import('/src/lib/export.ts');
    const { encodeResumePayload } = await import('/src/lib/resumeEmbed.ts');

    // 一页带真实内容的纸张（内容是什么不重要，重点是数据嵌入与还原）
    const root = document.createElement('div');
    root.innerHTML =
      '<div class="resume-page" style="position:relative;width:794px;height:1123px;overflow:hidden;' +
      'padding:48px 56px;font-family:sans-serif;color:#000">' +
      '<h1 style="font-size:22px">' + resume.basic.name + '</h1>' +
      '<p style="font-size:13px">' + (resume.basic.phone || '') + '  ' + (resume.basic.email || '') + '</p>' +
      resume.sections.map((s) => '<h2 style="font-size:15px;margin-top:18px">' + s.title + '</h2>').join('') +
      '</div>';

    const payload = await encodeResumePayload(resume);
    const html = buildPrintDocument(root, resume.name);
    return JSON.stringify({ html, payload, resume });
  })()`,
);
const { html, payload, resume: originalResume } = JSON.parse(build);
console.log('① 打印文档已生成：', (html.length / 1024).toFixed(1) + 'KB');

const svcRes = await fetch('http://127.0.0.1:8790/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ html, filename: 'roundtrip', payload }),
});
if (!svcRes.ok) {
  console.error('✗ 渲染服务返回', svcRes.status, await svcRes.text());
  process.exit(1);
}
const pdfBytes = Buffer.from(await svcRes.arrayBuffer());
const pdfPath = path.join('app', 'public', 'fixtures', 'roundtrip.pdf');
writeFileSync(pdfPath, pdfBytes);
console.log('② 渲染服务已出 PDF：', (pdfBytes.length / 1024).toFixed(1) + 'KB →', pdfPath);

/* ------------------------- ③ 用真实导入代码读回 ------------------------- */
await goto(APP_URL);
await sleep(1200);
const importedJson = await evaluate(
  `(async () => {
    const { readResumeFile } = await import('/src/lib/resumeImport.ts');
    const res = await fetch('/fixtures/roundtrip.pdf');
    const file = new File([await res.blob()], 'roundtrip.pdf', { type: 'application/pdf' });
    const r = await readResumeFile(file);
    return JSON.stringify({ embedded: r.embedded || null, textLen: r.text.length, needsOcr: !!r.needsOcr, hint: r.hint || '' });
  })()`,
);
const imported = JSON.parse(importedJson);
console.log(
  '③ 导入结果：',
  imported.embedded ? '✓ 识别到嵌入数据（完整恢复）' : `✗ 未识别到（textLen=${imported.textLen} needsOcr=${imported.needsOcr} hint=${imported.hint})`,
);
if (!imported.embedded) {
  console.log('\n原简历：', JSON.stringify(originalResume).slice(0, 300));
  process.exit(1);
}

/* ------------------------------- ④ 逐字段对比 ------------------------------- */
const IGNORE = new Set(['id', 'createdAt', 'updatedAt']);
const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v)
      .filter((k) => !IGNORE.has(k))
      .sort()
      .forEach((k) => {
        out[k] = normalize(v[k]);
      });
    return out;
  }
  return v;
};
const a = JSON.stringify(normalize(originalResume));
const b = JSON.stringify(normalize(imported.embedded));
if (a === b) {
  console.log('④ 往返对比：✓ 完全一致（', (a.length / 1024).toFixed(1) + 'KB 的结构化数据，逐字段相等）');
} else {
  console.log('④ 往返对比：✗ 不一致');
  // 找出第一个差异点
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      console.log('   首个差异 @', i, '\n   原:', a.slice(Math.max(0, i - 80), i + 80), '\n   导:', b.slice(Math.max(0, i - 80), i + 80));
      break;
    }
  }
  process.exit(1);
}

ws.close();
chrome.kill();
// Chrome 可能还没完全退出，清理失败不影响结果
try {
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(WORKDIR, { recursive: true, force: true });
  rmSync(pdfPath, { force: true });
} catch {
  /* ignore */
}
console.log('完成');
process.exit(0);

/**
 * 渲染用户导出的 PDF 并与「同数据预览」对比：
 * 逐行 dy 剖面 + 页底内容完整性 + 🔹 蓝色菱形检查。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PDFS = [['migrated', 'shots/fid-svc2/svc-migrated.pdf']];
const payloads = PDFS.map(([, p]) => readFileSync(p).toString('base64'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = path.join(process.env.TEMP || '/tmp', 'cdp-ucmp-' + Date.now());
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--no-proxy-server',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1200,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) { target = page; break; }
  } catch { /* retry */ }
  await sleep(200);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = (seq += 1);
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/resumes' });
await sleep(1800);

const result = await evaluate(`(async () => {
  const payloads = ${JSON.stringify(payloads)};
  const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
  const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const out = [];
  for (const b64 of payloads) {
    const raw = atob(b64);
    const u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) u8[i] = raw.charCodeAt(i);
    const doc = await pdfjs.getDocument({ data: u8, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 794 / page.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let blue = 0;
      for (let i = 0; i < c.width * c.height; i += 1) {
        const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
        if (Math.abs(r-43)<60 && Math.abs(g-123)<60 && Math.abs(b-205)<60) blue += 1;
      }
      pages.push({ w: c.width, h: c.height, blue, png: c.toDataURL('image/png') });
    }
    out.push({ numPages: doc.numPages, pages });

  }
  return JSON.stringify(out);
})()`);
const parsed = JSON.parse(result);
mkdirSync(path.resolve('shots/user-pdf'), { recursive: true });
parsed.forEach((doc, di) => {
  doc.pages.forEach((p, pi) => {
    const name = `shots/fid-svc2/${PDFS[di][0]}-p${pi + 1}.png`;
    writeFileSync(path.resolve(name), Buffer.from(p.png.split(',')[1], 'base64'));
    console.log(`${PDFS[di][0]} 第${pi + 1}页 ${p.w}x${p.h} 蓝色像素=${p.blue} → ${name}`);
  });
});
ws.close();
chrome.kill();
process.exit(0);

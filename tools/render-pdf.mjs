/* 把 PDF 逐页渲染成 PNG 落盘（用于肉眼比对）。用法：node tools/render-pdf.mjs <pdf> <out-prefix> [宽=794] */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pdfPath = path.resolve(process.argv[2]);
const outPrefix = path.resolve(process.argv[3] || 'shots/render/pdf');
const W = Number(process.argv[4] || 794);
mkdirSync(path.dirname(outPrefix), { recursive: true });

const port = 9400 + Math.floor(Math.random() * 200);
const userDataDir = path.join(process.env.TEMP || '/tmp', 'cdp-rp-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--force-device-scale-factor=1', '--hide-scrollbars',
  '--no-proxy-server', '--proxy-bypass-list=<-loopback>',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1200,1400', 'about:blank',
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
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  msgId += 1;
  pending.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/resumes' });
await sleep(1500);
const out = await evaluate(`(async () => {
  const b64 = ${JSON.stringify(readFileSync(pdfPath).toString('base64'))};
  const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
  const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const raw = atob(b64);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) u8[i] = raw.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data: u8, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: ${W} / vp0.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
    pages.push({ p, w: Math.round(vp0.width * 100) / 100, h: Math.round(vp0.height * 100) / 100, url: c.toDataURL('image/png') });
  }
  return JSON.stringify(pages);
})()`);
for (const pg of JSON.parse(out)) {
  writeFileSync(`${outPrefix}-p${pg.p}.png`, Buffer.from(pg.url.split(',')[1], 'base64'));
  console.log(`p${pg.p}: ${pg.w}x${pg.h}pt`);
}
ws.close();
chrome.kill();
process.exit(0);

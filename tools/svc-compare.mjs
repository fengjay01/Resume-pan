/**
 * 「本地渲染服务」导出 PDF vs 预览（浏览器真实渲染）的逐页墨迹对比。
 * 用法：node tools/svc-compare.mjs [--pdf=shots/fid-user/svc-export.pdf] [--refs=shots/fid-user]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from 'node:path';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PDF = path.resolve(arg('pdf', 'shots/fid-user/svc-export.pdf'));
const REFS = path.resolve(arg('refs', 'shots/fid-user'));
const APP = arg('url', 'http://127.0.0.1:5173');

const refs = [];
for (let i = 1; i <= 6; i += 1) {
  try {
    refs.push('data:image/png;base64,' + readFileSync(path.join(REFS, `ref-p${i}.png`)).toString('base64'));
  } catch { break; }
}
if (!refs.length) throw new Error('找不到 ref-p*.png（先跑 vector-fidelity.mjs 生成）');
const pdfB64 = readFileSync(PDF).toString('base64');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = path.join(process.env.TEMP || '/tmp', 'cdp-svc-' + Date.now());
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
await send('Page.navigate', { url: `${APP}/resumes` });
await sleep(1500);

const result = await evaluate(`(async () => {
  const refs = ${JSON.stringify(refs)};
  const pdfB64 = ${JSON.stringify(pdfB64)};
  const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
  const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const raw = atob(pdfB64);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) u8[i] = raw.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data: u8, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 794 / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
    const refImg = new Image();
    await new Promise((res, rej) => { refImg.onload = res; refImg.onerror = rej; refImg.src = refs[p - 1]; });
    const W = Math.min(c.width, refImg.width); const H = Math.min(c.height, refImg.height);
    const a = c.getContext('2d').getImageData(0, 0, W, H).data;
    const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
    bc.getContext('2d').drawImage(refImg, 0, 0, W, H);
    const b = bc.getContext('2d').getImageData(0, 0, W, H).data;
    let hit = 0, miss = 0, extra = 0;
    for (let i = 0; i < W * H; i += 1) {
      const ia = a[i * 4] < 170 && a[i * 4 + 1] < 170 && a[i * 4 + 2] < 170;
      const ib = b[i * 4] < 170 && b[i * 4 + 1] < 170 && b[i * 4 + 2] < 170;
      if (ia && ib) hit += 1; else if (ib) miss += 1; else if (ia) extra += 1;
    }
    const tc = await page.getTextContent();
    out.push({ page: p, iou: Math.round((100 * hit / (hit + miss + extra || 1)) * 100) / 100, textChars: tc.items.reduce((n, i) => n + i.str.length, 0), png: c.toDataURL('image/png') });
  }
  return JSON.stringify({ pages: doc.numPages, results: out });
})()`);
const parsed = JSON.parse(result);
for (const r of parsed.results) {
  if (r.png) { mkdirSync(path.resolve('shots/svc'), { recursive: true }); writeFileSync(path.resolve('shots/svc/page-' + r.page + '.png'), Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; }
}
console.log(JSON.stringify(parsed, null, 1));
ws.close();
chrome.kill();
process.exit(0);

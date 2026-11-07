/** 桌面端冒烟：通过 CDP 给运行中的 Electron 窗口截图（node tools/desktop-shot.mjs） */
import { writeFile } from 'node:fs/promises';

const CDP_PORT = process.argv[2] || '9333';
const OUT = process.argv[3] || 'desktop-smoke-ui.png';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

const info = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    readyState: document.readyState,
    bodyChildren: document.body.children.length,
    hasRoot: !!document.getElementById('root'),
    rootChildren: document.getElementById('root')?.children.length ?? 0,
    text: document.body.innerText.slice(0, 160).replace(/\\n/g, ' | '),
  })`,
  returnByValue: true,
});
console.log('DOM:', info.result?.result?.value);

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 1200));
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (!shot.result?.data) { console.error('no screenshot data'); process.exit(1); }
await writeFile(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('saved:', OUT);
ws.close();

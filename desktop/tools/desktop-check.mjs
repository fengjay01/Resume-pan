/** 检查桌面端渲染层的导出链路状态：desktopServiceUrl、probeService 结果、zustand 数据 */
import { writeFile, readFile } from 'node:fs/promises';

const CDP_PORT = process.argv[2] || '9334';
const OUT = process.argv[3] || '';

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

const expr = `(async () => {
  const out = {};
  out.href = location.href;
  out.desktopServiceUrl = window.desktopServiceUrl ?? '(未注入)';
  out.lsKeys = Object.keys(localStorage);
  out.hasResumeData = !!localStorage.getItem('xl-resume-data');
  // 与 app 同款探活
  const probe = async (url) => {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 800);
      const r = await fetch(url + '/ping', { signal: c.signal }); clearTimeout(t);
      const d = await r.json();
      return r.ok && d.ok === true ? JSON.stringify(d) : 'bad:' + r.status;
    } catch (e) { return 'fail:' + e.message; }
  };
  out.pingDesktop = out.desktopServiceUrl && out.desktopServiceUrl !== '(未注入)'
    ? await probe(out.desktopServiceUrl) : '-';
  out.ping8790 = await probe('http://127.0.0.1:8790');
  return JSON.stringify(out, null, 2);
})()`;

const info = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(info.result?.result?.value ?? JSON.stringify(info.result));

// 有截图路径则顺手截一张（调试用）
if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) await writeFile(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('shot saved:', OUT);
}
ws.close();

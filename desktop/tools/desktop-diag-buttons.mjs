/** 诊断：/resumes 页面上工具栏按钮都有什么 */
const CDP_PORT = process.argv[2] || '9335';
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
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
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    path: location.pathname,
    ready: document.readyState,
    buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim().slice(0, 20)),
    bodyStart: document.body.innerText.slice(0, 120).replace(/\\n/g, ' | '),
  })`,
  returnByValue: true,
});
console.log(r.result?.result?.value);
ws.close();

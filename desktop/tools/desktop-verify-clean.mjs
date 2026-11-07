/** 校验测试数据清理：无 xshot-/xtab- 残留、无备份键 */
const CDP_PORT = process.argv[2] || '9338';
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
await new Promise((r) => setTimeout(r, 2500));
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]}}');
    const bad = [...obj.state.resumes.map((x) => x.id), ...obj.state.trashed.map((t) => t.resume.id)]
      .filter((id) => /^(xshot-|xtab-|xtest-)/.test(id));
    return JSON.stringify({ resumes: obj.state.resumes.length, trashed: obj.state.trashed.length, testLeft: bad.length,
      tabsKey: localStorage.getItem('xl-editor-tabs') === null ? '无' : '残留',
      backupKey: localStorage.getItem('xl-tabs-test-backup') === null ? '无' : '残留' });
  })()`,
  returnByValue: true,
});
console.log(r.result?.result?.value);
ws.close();
process.exit(0);

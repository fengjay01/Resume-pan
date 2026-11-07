/** 清理测试污染：优先用 *-test-backup 备份恢复用户数据，再过滤 xshot-/xtab-/xtest- 简历 */
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
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const isTest = (id) => /^(xshot-|xtab-|xtest-)/.test(id);
    // 优先用截图前的备份恢复；没有备份就过滤测试简历
    const backupKeys = Object.keys(localStorage).filter((k) => k === 'xl-shot-backup' || /-test-backup$/.test(k));
    if (backupKeys.length) {
      const b = localStorage.getItem(backupKeys[0]);
      if (b === '') localStorage.removeItem('xl-resume-data');
      else if (b !== null) localStorage.setItem('xl-resume-data', b);
      backupKeys.forEach((k) => localStorage.removeItem(k));
    }
    const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]}}');
    const r0 = obj.state.resumes.length;
    const t0 = obj.state.trashed.length;
    obj.state.resumes = obj.state.resumes.filter((x) => !isTest(x.id));
    obj.state.trashed = obj.state.trashed.filter((t) => !isTest(t.resume.id));
    localStorage.setItem('xl-resume-data', JSON.stringify(obj));
    localStorage.removeItem('xl-editor-tabs');
    return JSON.stringify({ backupUsed: backupKeys[0] || '无', removedResumes: r0 - obj.state.resumes.length, removedTrashed: t0 - obj.state.trashed.length,
      left: obj.state.resumes.length, trashed: obj.state.trashed.length,
      names: obj.state.resumes.map((x) => x.name).slice(0, 8) });
  })()`,
  returnByValue: true,
});
console.log(r.result?.result?.value);
ws.close();
process.exit(0);

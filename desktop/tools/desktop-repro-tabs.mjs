/**
 * 编辑器多标签页端到端验证（node tools/desktop-repro-tabs.mjs [cdpPort]）
 * 注入 3 份测试简历 → 打开两份编辑 → 验证标签条 / 切换 / 关闭 / 刷新恢复 → 清理数据。
 * 需要 Electron 以 --remote-debugging-port=<port> 启动。
 */
const CDP_PORT = process.argv[2] || '9337';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
}
async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(2200);
}
/** 等某个选择器出现 */
async function waitFor(selectorFn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await evaluate(selectorFn);
    if (ok) return true;
    await sleep(400);
  }
  return false;
}

await send('Runtime.enable');
await send('Page.enable');

/* ① 备份并注入 3 份测试简历 */
const backup = await evaluate(`localStorage.getItem('xl-resume-data')`);
const baseCount = backup ? JSON.parse(backup).state.resumes.length : 0;
const MINI = {
  basic: { avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false, workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '', customFields: [] },
  sections: [],
  style: { templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1, language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard', spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 } },
};
const seed = await evaluate(`(() => {
  localStorage.setItem('xl-tabs-test-backup', localStorage.getItem('xl-resume-data') || '');
  const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]},"version":0}');
  const mk = (id, name) => ({ ...${JSON.stringify(MINI)}, id, name, createdAt: Date.now(), updatedAt: Date.now() });
  obj.state.resumes = [mk('xtab-1', '测试标签A'), mk('xtab-2', '测试标签B'), mk('xtab-3', '测试标签C'), ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  return true;
})()`);
if (!seed) throw new Error('seed failed');
console.log(`① 已注入 3 份测试简历（原 ${baseCount} 份）`);

try {
  /* ② 直接进 B 的编辑器，再导航到 A —— 标签条应有 2 个 */
  await goto('http://127.0.0.1:8791/editor/xtab-2');
  await goto('http://127.0.0.1:8791/editor/xtab-1');
  const tabCount = await evaluate(`document.querySelectorAll('[role="tab"]').length`);
  console.log('② 打开两份后标签数：', tabCount, '（期望 2）');

  /* ③ 点击「测试标签B」标签 → URL 切到 xtab-2 */
  await evaluate(`(() => {
    const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试标签B'));
    t?.click();
  })()`);
  await sleep(1200);
  const atB = await evaluate(`location.pathname === '/editor/xtab-2' && !!document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.includes('测试标签B')`);
  console.log('③ 点标签切到 B：', atB);

  /* ④ 关闭当前标签（B）→ 自动切到相邻标签 */
  await evaluate(`(() => {
    const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试标签B'));
    t?.querySelector('button[aria-label^="关闭"]')?.click();
  })()`);
  await sleep(1200);
  const afterClose = await evaluate(`JSON.stringify({ path: location.pathname, tabs: document.querySelectorAll('[role="tab"]').length })`);
  console.log('④ 关闭 B 后：', afterClose, '（期望 path=/editor/xtab-1, tabs=1）');

  /* ⑤ 刷新 → 标签持久化（A/C 仍在） */
  await goto('http://127.0.0.1:8791/editor/xtab-3');
  await send('Page.reload');
  await sleep(2500);
  const afterReload = await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent.replace('关闭', '').trim()))`);
  console.log('⑤ 刷新后标签：', afterReload, '（期望含 测试标签A 与 测试标签C，无 B）');

  /* ⑥ 被删除的简历自动清出标签条 */
  await evaluate(`(() => {
    const obj = JSON.parse(localStorage.getItem('xl-resume-data'));
    obj.state.resumes = obj.state.resumes.filter((r) => r.id !== 'xtab-3');
    localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  })()`);
  await goto('http://127.0.0.1:8791/editor/xtab-1');
  const pruned = await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent.trim()))`);
  console.log('⑥ 删除 C 后标签：', pruned, '（期望只剩 测试标签A）');

  /* ⑥b 重新打开 B/C，点「全部关闭」→ 标签清空且回到列表页 */
  await goto('http://127.0.0.1:8791/editor/xtab-2');
  await goto('http://127.0.0.1:8791/editor/xtab-3');
  await goto('http://127.0.0.1:8791/editor/xtab-1');
  const hasCloseAll = await evaluate(`!!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('全部关闭'))`);
  await evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('全部关闭'));
    b?.click();
  })()`);
  await sleep(1200);
  const afterCloseAll = await evaluate(`JSON.stringify({ path: location.pathname, tabsKey: localStorage.getItem('xl-editor-tabs') })`);
  console.log('⑥b 全部关闭：', afterCloseAll, '（期望 path=/resumes, tabsKey 含 "tabs":[]）');
} finally {
  /* ⑦ 恢复用户数据 + 清理标签持久化 */
  await evaluate(`(() => {
    const b = localStorage.getItem('xl-tabs-test-backup');
    if (b === null) localStorage.removeItem('xl-resume-data');
    else localStorage.setItem('xl-resume-data', b);
    localStorage.removeItem('xl-tabs-test-backup');
    localStorage.removeItem('xl-editor-tabs');
  })()`);
  await goto('http://127.0.0.1:8791/resumes');
  const restored = await evaluate(`(JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[]}}').state.resumes.length)`);
  console.log(`⑦ 已恢复用户数据：${restored} 份，标签记录已清空`);
}
ws.close();
console.log('完成');

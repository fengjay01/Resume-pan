/**
 * 标签拖拽排序端到端验证（node tools/desktop-repro-tabdrag.mjs [cdpPort]）
 * 注入 3 份测试简历 → 打开编辑器 → CDP 合成鼠标事件拖动第一个标签到最后 →
 * 验证 xl-editor-tabs 顺序 → 恢复用户数据。
 */
const CDP_PORT = process.argv[2] || '9344';

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

await send('Runtime.enable');
await send('Page.enable');

/* ① 备份并注入 3 份测试简历，按顺序打开（标签顺序 1,2,3） */
const backup = await evaluate(`localStorage.getItem('xl-resume-data')`);
const baseCount = backup ? JSON.parse(backup).state.resumes.length : 0;
const MINI = {
  basic: { avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false, workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '', customFields: [] },
  sections: [],
  style: { templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1, language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard', spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 } },
};
await evaluate(`(() => {
  localStorage.setItem('xtab-drag-backup', localStorage.getItem('xl-resume-data') || '');
  const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]},"version":0}');
  const mk = (id, name) => ({ ...${JSON.stringify(MINI)}, id, name, createdAt: Date.now(), updatedAt: Date.now() });
  obj.state.resumes = [mk('xdrag-1', '测试拖A'), mk('xdrag-2', '测试拖B'), mk('xdrag-3', '测试拖C'), ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  localStorage.removeItem('xl-editor-tabs');
})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8791/editor/xdrag-1' });
await sleep(2500);
await evaluate(`location.href = '/editor/xdrag-2'; 1`);
await sleep(2000);
await evaluate(`location.href = '/editor/xdrag-3'; 1`);
await sleep(2000);
let order = await evaluate(`JSON.parse(localStorage.getItem('xl-editor-tabs')).state.tabs`);
console.log(`① 注入 3 份测试简历（原 ${baseCount} 份），初始标签顺序：`, order.join(','));

/* ② 合成鼠标：按住第一个标签中心，拖过第三个标签中心，松手 */
const src = await evaluate(`(() => {
  const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试拖A'));
  const r = t.getBoundingClientRect();
  return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
})()`);
const { x: sx, y: sy } = JSON.parse(src);
const dst = await evaluate(`(() => {
  const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试拖C'));
  const r = t.getBoundingClientRect();
  return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
})()`);
const { x: dx } = JSON.parse(dst);
// 过冲：真实「拖到最后」会越过目标中心，判定才是严格大于
const endX = dx + 24;
// 抓取偏移：按下时指针相对标签布局左缘的距离（此时无 transform）
const startRect = JSON.parse(
  await evaluate(`(() => {
    const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试拖A'));
    const r = t.getBoundingClientRect();
    return JSON.stringify({ left: r.left });
  })()`)
);
const grabOffset = sx - startRect.left;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(sx), y: Math.round(sy), button: 'left', clickCount: 1 });
// 分步移动，触达阈值并逐步换位；同时采样拖拽标签的视觉位置量化抖动
const steps = 12;
let maxDev = 0;
for (let i = 1; i <= steps; i += 1) {
  const x = Math.round(sx + ((endX - sx) * i) / steps);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: Math.round(sy), button: 'left' });
  await sleep(40);
  const actualLeft = await evaluate(`(() => {
    const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x2) => x2.textContent.includes('测试拖A'));
    return t.getBoundingClientRect().left;
  })()`);
  // 期望：标签视觉左缘 = 指针 X - 抓取偏移（1:1 跟手）
  const expected = x - grabOffset;
  const dev = Math.abs(actualLeft - expected);
  if (dev > maxDev) maxDev = dev;
  const domOrder = await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent.trim().slice(3, 5)).join('')`);
  if (dev > 2) console.log(`   step ${i}: x=${x} actual=${actualLeft.toFixed(1)} expected=${expected.toFixed(1)} dev=${dev.toFixed(1)} domOrder=${domOrder}`);
}
console.log(`② 拖动过程中最大跟手偏差：${maxDev.toFixed(1)}px（<3px 为无明显晃动）`);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(endX), y: Math.round(sy), button: 'left', clickCount: 1 });
await sleep(800);
order = await evaluate(`JSON.parse(localStorage.getItem('xl-editor-tabs')).state.tabs`);
console.log('② 拖动第一个标签到最后，松手后顺序：', order.join(','), '（期望 xdrag-2,xdrag-3,xdrag-1）');

/* ③ 拖回去：把最后一个拖到最前 */
const src2 = await evaluate(`(() => {
  const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试拖A'));
  const r = t.getBoundingClientRect();
  return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
})()`);
const s2 = JSON.parse(src2);
const dst2 = await evaluate(`(() => {
  const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => x.textContent.includes('测试拖B'));
  const r = t.getBoundingClientRect();
  return JSON.stringify({ x: r.left - 24, y: r.top + r.height / 2 });
})()`);
const d2 = JSON.parse(dst2);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(s2.x), y: Math.round(s2.y), button: 'left', clickCount: 1 });
for (let i = 1; i <= 12; i += 1) {
  const x = Math.round(s2.x + ((d2.x - s2.x) * i) / steps);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: Math.round(s2.y), button: 'left' });
  await sleep(40);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(d2.x), y: Math.round(s2.y), button: 'left', clickCount: 1 });
await sleep(800);
order = await evaluate(`JSON.parse(localStorage.getItem('xl-editor-tabs')).state.tabs`);
console.log('③ 拖回最前后顺序：', order.join(','), '（期望 xdrag-1,...）');

/* ④ 恢复用户数据 */
await evaluate(`(() => {
  const b = localStorage.getItem('xtab-drag-backup');
  if (b === null) localStorage.removeItem('xl-resume-data');
  else localStorage.setItem('xl-resume-data', b);
  localStorage.removeItem('xtab-drag-backup');
  localStorage.removeItem('xl-editor-tabs');
})()`);
const restored = await evaluate(`JSON.parse(localStorage.getItem('xl-resume-data')).state.resumes.length`);
console.log(`④ 已恢复用户数据：${restored} 份`);
ws.close();
console.log('完成');

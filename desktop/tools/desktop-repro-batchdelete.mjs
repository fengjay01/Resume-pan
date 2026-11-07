/**
 * 批量删除端到端验证（node tools/desktop-repro-batchdelete.mjs [cdpPort]）
 * 注入两份测试简历驱动真实 UI：验证回收站通道与彻底删除通道，结束后恢复原始数据。
 * 需要 Electron 以 --remote-debugging-port=<port> 启动。
 */
const CDP_PORT = process.argv[2] || '9335';

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
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  }
  return r.result?.result?.value;
}

async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(2000);
}

/** 批量删除弹窗的容器（Modal 用 fixed 全屏层实现，标题定位） */
const DIALOG_FIND = `Array.from(document.querySelectorAll('.fixed')).find((d) => d.textContent.includes('批量删除简历'))`;

async function openBatchDelete() {
  await goto('http://127.0.0.1:8791/resumes');
  let opened = null;
  for (let i = 0; i < 15 && !opened; i += 1) {
    opened = await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('批量操作'));
      if (!b) return null; b.click(); return true;
    })()`);
    if (!opened) await sleep(700);
  }
  if (!opened) throw new Error(`没找到「批量操作」按钮：${await evaluate('location.pathname')}`);
  await sleep(500);
  let clicked = null;
  for (let i = 0; i < 10 && !clicked; i += 1) {
    clicked = await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).filter((x) => x.textContent.trim() === '批量删除').pop();
      if (!b) return null; b.click(); return true;
    })()`);
    if (!clicked) await sleep(500);
  }
  if (!clicked) throw new Error('没找到菜单项「批量删除」');
  let dialog = null;
  for (let i = 0; i < 10 && !dialog; i += 1) {
    dialog = await evaluate(`!!${DIALOG_FIND}`);
    if (!dialog) await sleep(500);
  }
  if (!dialog) throw new Error('批量删除弹窗没打开');
  console.log('  · 弹窗已打开');
}

async function checkTestItems() {
  const n = await evaluate(`(() => {
    const dlg = ${DIALOG_FIND};
    if (!dlg) return -1;
    let count = 0;
    Array.from(dlg.querySelectorAll('label')).forEach((l) => {
      if (l.textContent.includes('测试-批量')) { l.querySelector('input[type="checkbox"]').click(); count += 1; }
    });
    return count;
  })()`);
  await sleep(300);
  return n;
}

async function clickDialogButton(match, exclude) {
  const ok = await evaluate(`(() => {
    const dlg = ${DIALOG_FIND};
    if (!dlg) return null;
    const b = Array.from(dlg.querySelectorAll('button')).filter((x) => x.textContent.includes('${match}')${exclude ? ` && !x.textContent.includes(${JSON.stringify(exclude)})` : ''}).pop();
    if (!b || b.disabled) return null; b.click(); return true;
  })()`);
  await sleep(700);
  return ok;
}

await send('Runtime.enable');
await send('Page.enable');

/* ---------- 备份并注入两份测试简历 ---------- */
const backup = await evaluate(`localStorage.getItem('xl-resume-data')`);
if (!backup) { console.error('用户数据为空，无法构造测试'); process.exit(1); }
const baseCount = JSON.parse(backup).state.resumes.length;
const MINI_RESUME = {
  basic: {
    avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false,
    workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '',
    customFields: [],
  },
  sections: [],
  style: {
    templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1,
    language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard',
    spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 },
  },
};
const mkExpr = (ids) => `(() => {
  const obj = JSON.parse(localStorage.getItem('xl-resume-data'));
  const src = obj.state.resumes[0] || obj.state.trashed[0]?.resume;
  const MINI = ${JSON.stringify(MINI_RESUME)};
  const mk = (id, name) => ({
    ...(src || {}), ...MINI,
    id, name, pinned: false, pinnedAt: undefined,
    createdAt: Date.now(), updatedAt: Date.now(),
    basic: { ...(src?.basic || MINI.basic) },
    style: { ...(src?.style || MINI.style) },
    sections: src ? src.sections : MINI.sections,
  });
  obj.state.resumes = [${ids.map(([id, name]) => `mk(${JSON.stringify(id)}, ${JSON.stringify(name)})`).join(', ')}, ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  return obj.state.resumes.length;
})()`;

const seeded = await evaluate(mkExpr([['xtest-1', '测试-批量A'], ['xtest-2', '测试-批量B']]));
console.log(`① 已注入 2 份测试简历：${seeded} 份（原 ${baseCount} 份）`);

try {
  /* ---------- 通道 1：移入回收站 ---------- */
  await openBatchDelete();
  const checked = await checkTestItems();
  console.log(`② 勾选测试简历 ${checked} 份`);
  const trashBtn = await clickDialogButton('移入回收站');
  if (!trashBtn) throw new Error('「移入回收站」按钮不可用');
  const afterTrash = await evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('xl-resume-data')).state;
    return JSON.stringify({ resumes: s.resumes.length, trashed: s.trashed.length, hasTest: s.resumes.some((r) => r.id.startsWith('xtest')) });
  })()`);
  console.log('③ 移入回收站后：', afterTrash, `（期望 resumes=${baseCount}, trashed≥2, hasTest=false）`);

  /* ---------- 通道 2：彻底删除（两步确认） ---------- */
  await evaluate(mkExpr([['xtest-3', '测试-批量C'], ['xtest-4', '测试-批量D']]));
  await openBatchDelete();
  await checkTestItems();
  const purgeStep = await clickDialogButton('彻底删除', '确认');
  if (!purgeStep) throw new Error('「彻底删除」按钮不可用');
  const confirmVisible = await evaluate(`document.body.innerText.includes('此操作不可恢复')`);
  console.log('④ 两步确认态出现：', confirmVisible);
  const purgeBtn = await clickDialogButton('确认彻底删除');
  if (!purgeBtn) throw new Error('「确认彻底删除」按钮不可用');
  const afterPurge = await evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('xl-resume-data')).state;
    return JSON.stringify({ resumes: s.resumes.length, testLeft: s.resumes.filter((r) => r.id.startsWith('xtest')).length });
  })()`);
  console.log('⑤ 彻底删除后：', afterPurge, `（期望 resumes=${baseCount}, testLeft=0）`);
} finally {
  /* ---------- 恢复用户原始数据 ---------- */
  await evaluate(`localStorage.setItem('xl-resume-data', ${JSON.stringify(backup)})`);
  await goto('http://127.0.0.1:8791/resumes');
  const restored = await evaluate(`JSON.parse(localStorage.getItem('xl-resume-data')).state.resumes.length`);
  console.log(`⑥ 已恢复用户原始数据：${restored} 份`);
}
ws.close();
console.log('完成');

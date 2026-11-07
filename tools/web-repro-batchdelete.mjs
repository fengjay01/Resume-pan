/**
 * Web 端批量删除复现（node tools/web-repro-batchdelete.mjs）
 * 无头 Chrome 连 5173 dev：备份用户数据 → 注入测试简历 → 驱动真实 UI 点「移入回收站」
 * 与「彻底删除」→ 抓取控制台异常与 store 变化 → 恢复备份。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'http://127.0.0.1:5173/resumes';
const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-bd-'));
const port = 9700 + Math.floor(Math.random() * 200);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--no-proxy-server',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1400,900', APP_URL,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = (await res.json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const pick = pages.find((t) => String(t.url).startsWith('http://127.0.0.1:5173')) || pages[0];
      if (pick) return pick;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome DevTools');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(`[exception] ${(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 500)}`);
  }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    const args = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (!args.includes('Download the React DevTools')) errors.push(`[console.${m.params.type}] ${args.slice(0, 400)}`);
  }
};
const send = (method, params = {}) => {
  seq += 1;
  const id = seq;
  return new Promise((resolve) => { pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
};
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  }
  return r.result?.result?.value;
}
const DIALOG_FIND = `Array.from(document.querySelectorAll('.fixed')).find((d) => d.textContent.includes('批量删除简历'))`;

await send('Runtime.enable');
await send('Page.enable');
/* 启动可能撞上 dev server 热重载停在错误页，强制导航一次并等应用就绪 */
await send('Page.navigate', { url: APP_URL });
await sleep(2000);
for (let i = 0; i < 15; i += 1) {
  const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('button')`);
  if (ready) break;
  await sleep(700);
}

/* ① 注入测试简历（无头 profile 与用户浏览器隔离，直接种数据） */
const backup = await evaluate(`localStorage.getItem('xl-resume-data')`);
const baseCount = backup ? JSON.parse(backup).state.resumes.length : 0;
const MINI = {
  basic: { avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false, workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '', customFields: [] },
  sections: [],
  style: { templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1, language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard', spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 } },
};
const seedExpr = `(() => {
  const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]},"version":0}');
  const src = obj.state.resumes[0];
  const MINI = ${JSON.stringify(MINI)};
  const mk = (id, name) => ({ ...(src || {}), ...MINI, id, name, pinned: false, pinnedAt: undefined, createdAt: Date.now(), updatedAt: Date.now(),
    basic: { ...(src?.basic || MINI.basic) }, style: { ...(src?.style || MINI.style) }, sections: src ? src.sections : MINI.sections });
  obj.state.resumes = [mk('xtest-w1', '测试-批量W1'), ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  return obj.state.resumes.length;
})()`;
const seeded = await evaluate(seedExpr);
console.log(`① 注入测试简历：${seeded} 份（原 ${baseCount} 份）`);
await send('Page.navigate', { url: APP_URL });
await sleep(2500);

/* ② 打开批量删除弹窗 */
let opened = null;
for (let i = 0; i < 15 && !opened; i += 1) {
  opened = await evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('批量操作'));
    if (!b) return null; b.click(); return true;
  })()`);
  if (!opened) await sleep(700);
}
if (!opened) {
  const diag = await evaluate(`JSON.stringify({ path: location.pathname, ready: document.readyState, body: document.body.innerText.slice(0, 300).replace(/\\n/g, ' | ') })`);
  throw new Error(`没找到「批量操作」按钮：${diag}`);
}
await sleep(500);
await evaluate(`(() => {
  const b = Array.from(document.querySelectorAll('button')).filter((x) => x.textContent.trim() === '批量删除').pop();
  b?.click();
})()`);
await sleep(900);
console.log('② 弹窗打开：', await evaluate(`!!${DIALOG_FIND}`));

/* ③ 勾选测试简历并点「移入回收站」 */
const checked = await evaluate(`(() => {
  const dlg = ${DIALOG_FIND};
  let count = 0;
  Array.from(dlg.querySelectorAll('label')).forEach((l) => {
    if (l.textContent.includes('测试-批量W1')) { l.querySelector('input[type="checkbox"]').click(); count += 1; }
  });
  return count;
})()`);
console.log('③ 勾选：', checked);
await evaluate(`(() => {
  const dlg = ${DIALOG_FIND};
  const b = Array.from(dlg.querySelectorAll('button')).filter((x) => x.textContent.includes('移入回收站')).pop();
  b?.click();
})()`);
await sleep(1000);
const afterTrash = await evaluate(`(() => {
  const s = JSON.parse(localStorage.getItem('xl-resume-data')).state;
  return JSON.stringify({ resumes: s.resumes.length, trashed: s.trashed.length, hasTest: s.resumes.some((r) => r.id === 'xtest-w1') });
})()`);
console.log('④ 移入回收站后：', afterTrash, `（期望 resumes=${baseCount}, trashed≥1, hasTest=false）`);
console.log('⑤ 按钮点击后的 console/异常：', errors.length ? '' : '(无)');
for (const e of errors) console.log('  ', e);

/* 恢复（无头 profile：清掉测试数据即可，不影响用户浏览器） */
await evaluate(`localStorage.removeItem('xl-resume-data')`);

ws.close();
try { chrome.kill(); rmSync(userDataDir, { recursive: true, force: true }); } catch { /* */ }

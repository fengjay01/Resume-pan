/**
 * 桌面端导入链路复现：驱动真实 UI 走「导入简历」弹窗（node tools/desktop-repro-import.mjs <pdfPath>）
 * 需要 Electron 以 --remote-debugging-port=<port> 启动。
 */
import { copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CDP_PORT = process.argv[2] || '9334';
const PDF = process.argv[3];
if (!PDF) { console.error('usage: node desktop-repro-import.mjs [cdpPort] <pdfPath>'); process.exit(1); }
// ASCII 路径，避免 CDP 文件路径编码问题
const tmpPdf = path.join(tmpdir(), 'repro-import.pdf');
copyFileSync(PDF, tmpPdf);

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    events.push(`[console.${m.params.type}] ${args.slice(0, 300)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    events.push(`[exception] ${(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 400)}`);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  }
  return r.result?.result?.value;
}

// ① 去 /resumes
await send('Page.navigate', { url: 'http://127.0.0.1:8791/resumes' });
await sleep(2500);
console.log('① page:', await evaluate('location.pathname + " | resumes:" + JSON.parse(localStorage["xl-resume-data"]).state.resumes.length'));

// ② 点开「导入简历」
const clicked = await evaluate(`(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const b = btns.find((x) => x.textContent.includes('导入简历'));
  if (b) { b.click(); return b.textContent.trim(); }
  return null;
})()`);
console.log('② clicked:', clicked);
await sleep(1200);

// ③ 切到「上传文件」标签（默认是粘贴文本），再找 file input
const tab = await evaluate(`(() => {
  const btns = Array.from(document.querySelectorAll('[role="dialog"] button, [role="tab"], button'));
  const b = btns.filter((x) => x.textContent.trim() === '上传文件').pop();
  if (b) { b.click(); return 'switched'; }
  return null;
})()`);
console.log('③ tab:', tab);
await sleep(800);
const doc = await send('DOM.getDocument', { depth: -1 });
const q = await send('DOM.querySelector', { nodeId: doc.result?.root?.nodeId, selector: 'input[type="file"]' });
if (!q.result?.nodeId) {
  const dlgText = await evaluate(`Array.from(document.querySelectorAll('[role="dialog"]')).map((d) => d.innerText.slice(0, 200)).join('||') || '(无 dialog)'`);
  console.log('dialog text:', dlgText);
  console.error('✗ 没找到 file input');
  process.exit(1);
}
await send('DOM.setFileInputFiles', { files: [tmpPdf], nodeId: q.result.nodeId });
console.log('③ file input 已注入:', tmpPdf);

// ④ 等解析，看弹窗状态
await sleep(5000);
const state = await evaluate(`(() => {
  const dlg = Array.from(document.querySelectorAll('[role="dialog"], .fixed')).map((d) => d.innerText).find((t) => t && t.includes('导入'));
  if (!dlg) return '(没找到弹窗)';
  return dlg.replace(/\\n+/g, ' | ').slice(0, 600);
})()`);
console.log('④ 弹窗状态:', state);

// ⑤ 控制台/异常
console.log('⑤ console/exceptions:', events.length ? '' : '(无)');
for (const e of events.slice(-15)) console.log('  ', e);

ws.close();

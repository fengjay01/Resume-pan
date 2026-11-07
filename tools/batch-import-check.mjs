/**
 * 导入简历端到端冒烟测试（零依赖 CDP，仿 tools/shot.mjs 的 Chrome 驱动方式）。
 *
 * 两个阶段，都在「导入简历」弹窗的上传文件区完成：
 *  A. 单份回归：选 1 个 txt → 解析预览 → 解析并导入 → 跳编辑器，store +1；
 *  B. 批量新流程：再选 3 个文件（1 txt + 1 本产品导出的 PDF[嵌入数据] + 1 损坏 PDF）
 *     → 列表出现 → 开始导入（3）→ 成功 2 / 失败 1 → store 共 3 份。
 *
 * 用法：node tools/batch-import-check.mjs
 * 可选：--url=http://127.0.0.1:5173/resumes --out=shots/batch-import.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO = path.resolve(import.meta.dirname, '..');

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return true;
  return def;
}

const url = arg('url', 'http://127.0.0.1:5173/resumes');
const shotOut = arg('out', 'shots/batch-import.png');
const port = Number(arg('port', 9850 + Math.floor(Math.random() * 40)));
const origin = new URL(url).origin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 准备导入用的文件 ------------------------------ */
const workDir = mkdtempSync(path.join(tmpdir(), 'xl-import-'));
const txtA = path.join(workDir, '张三-后端工程师.txt');
const txtB = path.join(workDir, '李四-前端工程师.txt');
const brokenPdf = path.join(workDir, '损坏的文件.pdf');
const embeddedPdf = path.join(workDir, 'Resume-Pan导出件.pdf');
writeFileSync(
  txtA,
  [
    '张三',
    '13800000001  zhangsan@example.com',
    '求职意向：后端开发工程师',
    '教育背景',
    '2020.09-2024.06   某某大学   计算机科学与技术',
    '工作经历',
    '2024.07-至今   XX科技   后端开发工程师',
    '- 负责订单系统开发与性能优化',
    '专业技能',
    '熟悉 Java / MySQL / Redis',
  ].join('\n'),
  'utf8',
);
writeFileSync(
  txtB,
  [
    '李四',
    '13800000002  lisi@example.com',
    '求职意向：前端开发工程师',
    '教育背景',
    '2019.09-2023.06   某某学院   软件工程',
    '工作经历',
    '2023.07-至今   XX互联   前端开发工程师',
    '- 负责中后台页面与组件库建设',
    '专业技能',
    '熟悉 TypeScript / React / Vite',
  ].join('\n'),
  'utf8',
);
writeFileSync(brokenPdf, '%PDF-1.4\n这不是一个合法的 PDF，内容已损坏\n%%EOF', 'utf8');
copyFileSync(path.join(REPO, 'app/public/fixtures/roundtrip.pdf'), embeddedPdf);

const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-import-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--no-proxy-server', // 本机系统代理会拦 127.0.0.1，必须直连
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1600,1000',
    '--disable-features=Translate,BackForwardCache',
    url,
  ],
  { stdio: 'ignore' },
);

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const ours = pages.find((t) => String(t.url).startsWith(origin));
      const pick = ours || pages[0];
      if (pick) return pick;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome DevTools，端口 ' + port);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageErrors.push(d.exception?.description || d.text || 'unknown');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};

function send(method, params = {}) {
  msgId += 1;
  const id = msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

async function goto(targetUrl) {
  const base = targetUrl.split('#')[0];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await send('Page.navigate', { url: targetUrl });
    } catch {
      /* ignore */
    }
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      try {
        const href = await evaluate('String(location.href)');
        if (typeof href === 'string' && href.startsWith(base)) return;
      } catch {
        /* retry */
      }
    }
  }
  throw new Error('页面导航失败：' + targetUrl);
}

async function waitFor(fn, timeoutMs = 20000, interval = 300) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(interval);
  }
  return false;
}

async function waitForButton(text, timeoutMs = 20000) {
  return waitFor(
    () =>
      evaluate(
        `Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes(${JSON.stringify(text)}))`,
      ),
    timeoutMs,
  );
}

async function clickButton(text) {
  return evaluate(`(() => {
    const t = ${JSON.stringify(text)};
    const el = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').includes(t));
    if (!el) return 'NOT_FOUND';
    el.scrollIntoView({block:'center'});
    el.click();
    return 'OK';
  })()`);
}

/** 打开导入弹窗并切到上传文件 tab */
async function openImportModal() {
  check('点击「导入简历」', (await clickButton('导入简历')) === 'OK');
  await sleep(900);
  check('切到「上传文件」', (await clickButton('上传文件')) === 'OK');
  await sleep(500);
}

/** 往弹窗里的 file input 塞文件 */
async function setFiles(files) {
  const handle = await send('Runtime.evaluate', {
    expression: "document.querySelector('input[type=file][multiple]')",
  });
  if (!handle.result?.objectId) throw new Error('file input 不存在');
  await send('DOM.setFileInputFiles', {
    files: files.map((f) => path.resolve(f)),
    objectId: handle.result.objectId,
  });
}

const storeCount = () =>
  evaluate(`JSON.parse(localStorage.getItem('xl-resume-data')||'{}').state?.resumes?.length ?? -1`);

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto(url);

  // 种子：0 份简历，保证导入后的计数断言不受环境影响
  await evaluate(
    `localStorage.setItem('xl-resume-data', ${JSON.stringify(JSON.stringify({ state: { resumes: [], trashed: [] }, version: 0 }))})`,
  );
  await goto(url);

  /* ---------------- 阶段 A：单份导入（原流程回归） ---------------- */
  check('列表页就绪', await waitForButton('导入简历'));
  await openImportModal();
  await setFiles([txtA]);
  await sleep(1600);
  const preview = await evaluate(
    `document.body.innerText.includes('解析完成') && document.body.innerText.includes('简历名称')`,
  );
  check('单份：出现解析预览与名称输入', !!preview);
  check('单份：点击「解析并导入」', (await clickButton('解析并导入')) === 'OK');
  const inEditor = await waitFor(
    () => evaluate('String(location.pathname).startsWith("/editor/")'),
    15000,
  );
  check('单份：导入后跳转编辑器', inEditor);
  await sleep(600);
  check('单份：store +1', (await storeCount()) === 1, `resumes=${await storeCount()}`);

  /* ---------------- 阶段 B：批量导入（上传几个导入几份） ---------------- */
  await goto(url);
  check('回到列表页', await waitForButton('导入简历'));
  await openImportModal();
  await setFiles([txtB, embeddedPdf, brokenPdf]);
  await sleep(800);
  const picked = await evaluate(`document.body.innerText.match(/已选\\s*(\\d+)\\s*个文件/)?.[1]`);
  check('批量：文件列表显示 3 个文件', picked === '3', `已选=${picked}`);
  const nameInputGone = await evaluate(
    `document.querySelectorAll('input[placeholder="例如：张三的简历"]').length`,
  );
  check('批量：名称输入隐藏（名称取文件名）', nameInputGone === 0);
  const startBtn = await evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').includes('开始导入'));
    return el ? { text: el.textContent.trim(), disabled: el.disabled } : null;
  })()`);
  check('批量：「开始导入」按钮可用', !!startBtn && !startBtn.disabled, JSON.stringify(startBtn));
  check('批量：点击「开始导入」', (await clickButton('开始导入')) === 'OK');

  const done = await waitFor(
    () => evaluate(`document.body.innerText.includes('导入完成：成功 2 份')`),
    180000,
    1000,
  );
  check('批量：流程走完（出现「导入完成：成功 2 份」）', done);
  const summaryOk = await evaluate(
    `/导入完成：成功\\s*2\\s*份/.test(document.body.innerText) && /失败\\s*1\\s*份/.test(document.body.innerText)`,
  );
  check('批量：汇总 成功 2 / 失败 1', !!summaryOk);
  const doneRows = await evaluate(`(document.body.innerText.match(/已导入/g) || []).length`);
  check('批量：2 份标记为已导入', doneRows === 2, `已导入=${doneRows}`);
  const failedReason = await evaluate(
    `/(文字识别失败|文件读取失败|解析失败|没有可解析)/.test(document.body.innerText)`,
  );
  check('批量：损坏文件标记为失败（含原因）', !!failedReason);

  await sleep(500);
  check('批量：store 共 3 份', (await storeCount()) === 3, `resumes=${await storeCount()}`);
  const header = await evaluate(`/共\\s*3\\s*份简历/.test(document.body.innerText)`);
  check('批量：页面计数同步为「共 3 份简历」', !!header);
  const names = await evaluate(
    `JSON.parse(localStorage.getItem('xl-resume-data')||'{}').state.resumes.map(r => r.name)`,
  );
  console.log('导入的简历:', JSON.stringify(names));

  // 结束截图（停在批量完成态）
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(path.dirname(shotOut), { recursive: true });
  const { writeFileSync: wf } = await import('node:fs');
  wf(shotOut, Buffer.from(shot.data, 'base64'));
  console.log('saved:', shotOut);
} catch (err) {
  check('测试执行', false, String(err?.message || err));
} finally {
  console.log('pageErrors:', pageErrors.length ? JSON.stringify(pageErrors.slice(0, 5), null, 1) : '(none)');
  ws.close();
  chrome.kill();
  setTimeout(() => {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }, 1000);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n===== 导入（单份 + 批量）：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：', failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}

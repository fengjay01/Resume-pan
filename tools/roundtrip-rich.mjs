/**
 * 「导出 PDF → 导入」往返一致性测试（重点：加粗 / 斜体 / 列表 / 缩进等富文本格式）。
 *
 * 流程：
 *  1. 打开编辑器，通过真实 store 给简历塞进带 <strong>/<em>/<ul><li>/缩进 的富文本；
 *  2. 抓取**实时预览 DOM**（就是导出用的那份），用真实导出代码
 *    （encodeResumePayload + buildPrintDocument）生成打印 HTML，
 *     让无头 Chrome 用 CDP `Page.printToPDF` 打成 PDF（等价于「另存为 PDF」）；
 *  3. 用真实导入代码（readResumeFile）读回，把恢复出的简历塞回 store 让预览重新渲染；
 *  4. 断言：① 解码出的简历与原简历 JSON 逐字节相等；② 两次预览渲染的 HTML 完全一致；
 *     ③ 加粗 / 斜体 / 列表 / 缩进都在。
 *
 * 用法：node tools/roundtrip-rich.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = 'http://127.0.0.1:5173/editor/sample-resume';
const SEED = path.resolve('tools/seeds/seed-multi.json');

const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-rt2-'));
const port = 9600 + Math.floor(Math.random() * 300);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1400,900',
    APP_URL,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const pick = pages.find((t) => String(t.url).startsWith('http://127.0.0.1:5173')) || pages[0];
      if (pick) return pick;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome DevTools');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
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
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

async function goto(targetUrl) {
  for (let i = 0; i < 6; i += 1) {
    await send('Page.navigate', { url: targetUrl });
    await sleep(1200);
    const href = await evaluate('location.href');
    if (String(href).startsWith(targetUrl.split('#')[0])) return;
  }
  throw new Error('导航失败：' + targetUrl);
}

/* 种子要在**应用 JS 启动之前**就写进 localStorage —— 否则应用可能先以空数据启动，
 * 再把空状态写回 localStorage，把种子覆盖掉。用 CDP 的
 * addScriptToEvaluateOnNewDocument：每次新文档创建时（应用代码运行前）先执行。 */
const seedJson = readFileSync(SEED, 'utf8');
const seedScript = `
  window.__seedRan = Date.now();
  try {
    const seed = ${seedJson};
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
    window.__seedKeys = Object.keys(localStorage).filter((k) => k.startsWith('xl')).join(',');
    window.__seedData = (localStorage.getItem('xl-resume-data') || 'NULL').slice(0, 80);
  } catch (e) {
    window.__seedErr = String(e && e.message ? e.message : e);
  }
`;
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript });

await goto(APP_URL);
await sleep(2500);

/* -------- ① 注入富文本内容，抓取预览 DOM，生成打印 HTML -------- */
const build = await evaluate(
  `(async () => {
    const { useResumeStore } = await import('/src/store/resumeStore.ts');
    const { buildPrintDocument } = await import('/src/lib/export.ts');
    const { encodeResumePayload } = await import('/src/lib/resumeEmbed.ts');

    // 等 store 水合完成（首次启动可能被 auth 重定向到 /login 再回来）
    for (let i = 0; i < 50; i += 1) {
      if (useResumeStore.getState().resumes.length > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const store = useResumeStore.getState();
    const resume = store.resumes[0];
    if (!resume) {
      return JSON.stringify({
        err: 'store 未水合',
        seedRan: window.__seedRan || '未运行',
        seedKeys: window.__seedKeys || '-',
        seedData: window.__seedData || '-',
        seedErr: window.__seedErr || '-',
        href: location.href,
        ready: document.readyState,
        editor: document.body.textContent.includes('下载简历'),
        rawData: (localStorage.getItem('xl-resume-data') || 'NULL').slice(0, 150),
        hydrated: useResumeStore.getState().hydrated,
      });
    }
    const resumeId = resume.id;

    // 用户实际会写的富文本：加粗标签、加粗正文、斜体、列表、缩进
    const rich =
      '<p>项目介绍：面向自动充电场景的机器人系统，实现视觉定位、运动控制及自动插枪/拔枪全流程自主作业。</p>' +
      '<ul>' +
      '<li><strong>功能开发与系统联调：</strong>参与视觉定位、运动控制、<em>自动插枪/拔枪任务状态机</em>等功能开发，跟踪项目节点、交付物与验收要求。</li>' +
      '<li><strong>现场测试与问题闭环：</strong>针对插枪位置偏差问题，协调视觉算法组优化视觉算法。</li>' +
      '</ul>' +
      '<p style="padding-left:2em">　　创新基金：《基于视觉伺服控制的内窥镜检测研究》（重点）</p>' +
      '<p><strong>项目成果：</strong>插枪成功率由 90% 提升至 99%，<strong>单流程时间由 60s 压缩至约 30s</strong>，末端定位精度达 1° 以内。</p>';

    store.update(resumeId, (r) => ({
      ...r,
      sections: r.sections.map((s) =>
        s.type === 'project' || s.type === 'work'
          ? { ...s, items: s.items.map((it) => ({ ...it, content: rich })) }
          : s,
      ),
    }));
    // 等两趟渲染（量测 → 分页）完成
    await new Promise((r) => setTimeout(r, 1800));

    const updated = useResumeStore.getState().resumes.find((r) => r.id === resumeId);
    // 预览用的就是这份 DOM（真实导出时抓的也是它）
    const previewEl = document.querySelector('[data-page-count]');
    const originalHtml = previewEl.outerHTML;

    const payload = await encodeResumePayload(updated);
    const holder = document.createElement('div');
    holder.innerHTML = originalHtml;
    const html = buildPrintDocument(holder, updated.name);
    return JSON.stringify({ html, resume: updated, originalHtml });
  })()`,
);
const parsedBuild = JSON.parse(build);
if (parsedBuild.err) { console.log('store 未水合：' + JSON.stringify(parsedBuild).slice(0, 600)); process.exit(1); }
const { html, resume: original, originalHtml } = parsedBuild;
console.log('① 打印文档已生成：', (html.length / 1024).toFixed(1) + 'KB；预览渲染 HTML：' + (originalHtml.length / 1024).toFixed(1) + 'KB');

const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
await goto(dataUrl);
await sleep(1200);
const printed = await send('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
});
const pdfPath = path.resolve('app/public/fixtures/roundtrip-rich.pdf');
writeFileSync(pdfPath, Buffer.from(printed.data, 'base64'));
console.log('② 已打印成 PDF');

/* -------- ③ 导入并让预览用恢复出的简历重新渲染 -------- */
await goto(APP_URL);
await sleep(1800);
const result = await evaluate(
  `(async () => {
    const { useResumeStore } = await import('/src/store/resumeStore.ts');
    const { readResumeFile } = await import('/src/lib/resumeImport.ts');
    const res = await fetch('/fixtures/roundtrip-rich.pdf');
    const file = new File([await res.blob()], 'roundtrip-rich.pdf', { type: 'application/pdf' });
    const r = await readResumeFile(file);
    if (!r.embedded) return JSON.stringify({ ok: false, textLen: r.text.length, needsOcr: !!r.needsOcr, hint: r.hint || '' });
    const imported = r.embedded;
    // 把恢复出的简历塞回 store，让预览重新渲染（渲染路径与导出前完全相同）
    const originals = useResumeStore.getState().resumes;
    useResumeStore.setState({ resumes: [imported] });
    await new Promise((rr) => setTimeout(rr, 1800));
    const previewEl = document.querySelector('[data-page-count]');
    const importedHtml = previewEl ? previewEl.outerHTML : '';
    useResumeStore.setState({ resumes: originals });
    return JSON.stringify({ ok: true, imported, importedHtml });
  })()`,
);
const { ok, imported, importedHtml } = JSON.parse(result);
console.log('③ 导入结果：', ok ? '✓ 识别到嵌入数据（完整恢复）' : '✗ 未识别到', ok ? '' : JSON.stringify({ textLen: result && 0 }));
if (!ok) process.exit(1);

/* -------- ④ 断言 -------- */
let pass = true;
const assert = (name, cond, extra = '') => {
  console.log((cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ' + extra));
  if (!cond) pass = false;
};

// ① 数据逐字节一致（嵌入的就是导出前的 JSON，解码回来应当一字不差）
const sameJson = JSON.stringify(imported) === JSON.stringify(original);
assert('④-1 简历数据与导出前逐字节一致（含全部 id / 样式 / 内容）', sameJson);

// ② 富文本格式全在
const project = imported.sections.find((s) => s.type === 'project');
const content = project.items.map((i) => i.content).join('');
assert('④-2 保留加粗标签（<strong>）', content.includes('<strong>功能开发与系统联调：</strong>'));
assert('④-3 保留斜体（<em>）', content.includes('<em>自动插枪/拔枪任务状态机</em>'));
assert('④-4 保留列表（<ul><li>）', content.includes('<ul>') && content.includes('<li>'));
assert('④-5 保留缩进（padding-left:2em）', content.includes('padding-left:2em'));
assert('④-6 加粗正文完整', content.includes('<strong>单流程时间由 60s 压缩至约 30s</strong>'));

// ③ 导入前后预览渲染的 HTML 完全一致 → 排版必然一模一样
assert('④-7 导入前后预览渲染 HTML 完全一致（排版零差异）', importedHtml === originalHtml,
  '长度 ' + importedHtml.length + ' vs ' + originalHtml.length);

console.log(pass ? '\n结果：PASS ✅ 加粗、斜体、列表、缩进与整体排版全部无损还原' : '\n结果：FAIL ❌');
ws.close();
chrome.kill();
try {
  const fs = await import('node:fs');
  fs.rmSync(pdfPath, { force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {
  /* Chrome 可能尚未退出 */
}
process.exit(pass ? 0 : 1);

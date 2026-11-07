/**
 * 批量导出端到端冒烟测试（零依赖 CDP，仿 tools/shot.mjs 的 Chrome 驱动方式）。
 *
 * 验证链路：/resumes 页面 → 打开「批量导出」弹窗 → 默认全选 → 取消勾选 1 份
 * （测部分选择）→ 选择导出方式（vector | image）→ 开始导出 → 等「导出完成」
 * → 校验下载目录里的 PDF 数量 / 文件名 / 文件头。
 *
 * 用法：
 *   node tools/batch-export-check.mjs --mode=vector
 *   node tools/batch-export-check.mjs --mode=image
 *   node tools/batch-export-check.mjs --mode=vector --folder   # 保存到「选择的文件夹」
 * 可选：--url=http://127.0.0.1:5173/resumes --seed=tools/seeds/seed-few.json
 *       --download=<dir> --keep-count=2（期望成功的份数，默认 2）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return true;
  return def;
}

const mode = arg('mode', 'vector'); // vector | image
const useFolder = !!arg('folder', false); // 走「选择文件夹」直写（mock 原生对话框）
const url = arg('url', 'http://127.0.0.1:5173/resumes');
const seedFile = arg('seed', 'tools/seeds/seed-few.json');
const expectCount = Number(arg('keep-count', 2));
const port = Number(arg('port', 9500 + Math.floor(Math.random() * 400)));
const shotOut = arg('out', `shots/batch-export-${mode}.png`);
const downloadDir = arg('download', null) || mkdtempSync(path.join(tmpdir(), 'xl-batch-dl-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = new URL(url).origin;

const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-batch-'));
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

/** 等页面出现包含指定文本的 button */
async function waitForButton(text, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await evaluate(
      `Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes(${JSON.stringify(text)}))`,
    );
    if (ok) return true;
    await sleep(300);
  }
  return false;
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

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await goto(url);

  mkdirSync(downloadDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(downloadDir), eventsEnabled: true });

  // 注入种子数据后重新导航（zustand persist 在水合时读取 localStorage）
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  for (const [k, v] of Object.entries(seed)) {
    await evaluate(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`);
  }
  await goto(url);

  // ① 列表页就绪（出现批量导出入后）
  const listReady = await waitForButton('批量导出');
  check('简历列表页加载（含批量导入口）', listReady);

  // ①.5 文件夹模式：mock showDirectoryPicker（原生对话框无头里点不了），
  //     并预置一个同名文件，验证重名自动加 (1) 后缀
  if (useFolder) {
    const installed = await evaluate(`(() => {
      window.__folderWrites = [{ name: '算法工程师-视觉方向.pdf', size: 1, type: 'application/pdf' }];
      window.showDirectoryPicker = async () => ({
        kind: 'directory',
        name: 'E2E-测试文件夹',
        getFileHandle: async (name, opts) => {
          const known = window.__folderWrites.some((w) => w.name === name);
          // 真实语义：不存在且不允许创建 → NotFoundError；存在 → 返回句柄
          if (!known && !(opts && opts.create)) {
            const e = new Error('NotFound');
            e.name = 'NotFoundError';
            throw e;
          }
          return {
            getFile: async () => new File([], name),
            createWritable: async () => ({
              write: async (blob) => {
                window.__folderWrites.push({ name, size: blob.size, type: blob.type });
              },
              close: async () => {},
            }),
          };
        },
      });
      return true;
    })()`);
    check('安装文件夹选择 mock', installed === true);
  }

  // ② 打开批量导出弹窗
  check('点击「批量导出」', (await clickButton('批量导出')) === 'OK');
  await sleep(900);
  const modalReady = await evaluate(
    `document.body.innerText.includes('批量导出简历') && document.body.innerText.includes('导出方式')`,
  );
  check('弹窗打开（标题 + 导出方式）', !!modalReady);

  // ③ 默认全选：读「已选 n / 共 m 份」
  const selText = await evaluate(`(() => {
    const m = /已选\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*份/.exec(document.body.innerText);
    return m ? m[1] + '/' + m[2] : null;
  })()`);
  check('默认全选', selText === '3/3', `已选=${selText}`);

  // ④ 取消勾选最后 1 份 → 期望导出 2 份（测部分选择）
  const unchecked = await evaluate(`(() => {
    const boxes = Array.from(document.querySelectorAll('input[type=checkbox]'));
    if (boxes.length !== 3) return 'CHECKBOX_COUNT=' + boxes.length;
    boxes[boxes.length - 1].click();
    return 'OK';
  })()`);
  check('取消勾选 1 份', unchecked === 'OK', String(unchecked));
  await sleep(400);
  const selText2 = await evaluate(`(() => {
    const m = /已选\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*份/.exec(document.body.innerText);
    return m ? m[1] + '/' + m[2] : null;
  })()`);
  check('勾选状态更新为 2/3', selText2 === '2/3', `已选=${selText2}`);

  // ④.5 选择保存文件夹
  if (useFolder) {
    check('点击「选择文件夹」', (await clickButton('选择文件夹')) === 'OK');
    await sleep(400);
    const loc = await evaluate(`document.body.innerText.includes('E2E-测试文件夹')`);
    check('保存位置显示已选文件夹', !!loc);
  }

  // ⑤ 选择导出方式（与编辑器两种方式一致）
  if (mode === 'image') {
    check('选择「图片版 PDF（兼容模式）」', (await clickButton('图片版 PDF（兼容模式）')) === 'OK');
    await sleep(300);
  } else {
    check('默认「浏览器导出（推荐 · 无损矢量 · 放大不失真）」', await evaluate(
      `document.body.innerText.includes('浏览器导出（推荐 · 无损矢量 · 放大不失真）')`,
    ));
  }

  // ⑥ 开始导出
  const startBtn = await evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').includes('开始导出'));
    return el ? { text: el.textContent.trim(), disabled: el.disabled } : null;
  })()`);
  check('「开始导出」按钮可用', !!startBtn && !startBtn.disabled, JSON.stringify(startBtn));
  check('点击「开始导出」', (await clickButton('开始导出')) === 'OK');

  // ⑦ 服务不在时快速失败（弹窗里有明确指引，不该走到超时）
  await sleep(2500);
  const svcDown = await evaluate(`document.body.innerText.includes('本地渲染服务未启动')`);
  if (svcDown) {
    check('本地渲染服务可用', false, '8790 未运行：dev 模式下应随 vite 自动拉起');
    throw new Error('渲染服务未启动，终止测试');
  }
  check('本地渲染服务可用（无降级提示）', true);

  // ⑧ 轮询等「导出完成」
  let done = false;
  const deadline = Date.now() + 180000;
  let lastText = '';
  while (Date.now() < deadline) {
    await sleep(1000);
    const text = await evaluate('document.body.innerText');
    lastText = String(text || '');
    if (lastText.includes('导出完成')) {
      done = true;
      break;
    }
    if (lastText.includes('导出失败') && !lastText.includes('正在导出')) {
      // 抓一条失败原因就停
      break;
    }
  }
  check('导出流程走完（出现「导出完成」）', done, done ? '' : `lastText=${lastText.slice(-200)}`);

  // ⑨ 汇总文案：成功 2 份
  const summaryOk = await evaluate(
    `/成功\\s*2\\s*份/.test(document.body.innerText) && !/失败\\s*[1-9]/.test(document.body.innerText)`,
  );
  check('汇总：成功 2 份、无失败', !!summaryOk);

  // ⑩ 产物校验：文件夹直写 vs 浏览器下载
  await sleep(1500); // 等最后一个文件落盘
  if (useFolder) {
    const writes = (await evaluate('window.__folderWrites')) || [];
    const names = writes.map((w) => w.name);
    const added = names.filter((n) => n !== '算法工程师-视觉方向.pdf');
    check(`文件夹直写：新增 ${expectCount} 个文件`, added.length === expectCount, JSON.stringify(names));
    check('重名自动加 (1) 后缀', names.includes('算法工程师-视觉方向 (1).pdf'), JSON.stringify(names));
    check(
      '写入内容非空',
      writes.slice(1).every((w) => w.size > 5000),
      JSON.stringify(writes.slice(1).map((w) => w.size)),
    );
    check(
      '未触发浏览器下载',
      readdirSync(downloadDir).filter((f) => f.endsWith('.pdf')).length === 0,
      JSON.stringify(readdirSync(downloadDir)),
    );
  } else {
    const files = readdirSync(downloadDir).filter((f) => f.endsWith('.pdf'));
    check(`下载目录生成 ${expectCount} 个 PDF`, files.length === expectCount, `files=${JSON.stringify(files)}`);
    for (const f of files) {
      const buf = readFileSync(path.join(downloadDir, f));
      const head = buf.subarray(0, 5).toString('latin1');
      check(`PDF 文件头有效：${f}`, head === '%PDF-', `size=${(statSync(path.join(downloadDir, f)).size / 1024).toFixed(0)}KB head=${head}`);
    }
  }

  // 结束截图（弹窗应停在「导出完成」汇总态）
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(path.dirname(shotOut), { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(shotOut, Buffer.from(shot.data, 'base64'));
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
    } catch {
      /* ignore */
    }
  }, 1000);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n===== ${mode} 模式：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：', failed.map((f) => f.name).join(' | '));
  process.exitCode = 1;
}

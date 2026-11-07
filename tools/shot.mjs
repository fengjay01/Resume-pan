/**
 * 无头 Chrome + CDP 截图/冒烟测试工具（零依赖，仅用 Node 内置 WebSocket / fetch）
 *
 * 用法：
 *   node tools/shot.mjs --url=http://127.0.0.1:5173/ --out=shots/home.png --wait=2500
 * 可选：
 *   --seed=seed.json    载入前写入 localStorage（{ "key": {object} }，值会被 JSON.stringify）
 *   --click=文本        载入后点击包含该文本的第一个 button/a（用于跑真实链路）
 *   --click-wait=ms     点击后等待（默认 1800）
 *   --full              整页截图（默认只截视口）
 *   --w=1600 --h=1000   视口尺寸
 *   --console           打印页面 console 与运行时错误
 *   --eval=js           载入后执行一段 JS
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return true;
  return def;
}

const url = arg('url', 'http://127.0.0.1:5173/');
const out = arg('out', 'shot.png');
const wait = Number(arg('wait', 2500));
const clickText = arg('click', null);
const clickWait = Number(arg('click-wait', 1800));
const full = !!arg('full', false);
const width = Number(arg('w', 1600));
const height = Number(arg('h', 1000));
const seedFile = arg('seed', null);
const evalJs = arg('eval', null);
const evalFile = arg('eval-file', null);
const downloadDir = arg('download', null);
const evalFileAfter = arg('eval-after-file', null);
const uploadFile = arg('upload', null);
const click2Text = arg('click2', null);
const click2Wait = Number(arg('click2-wait', 1800));
const hoverText = arg('hover', null);
const showConsole = !!arg('console', false);
const port = Number(arg('port', 9200 + Math.floor(Math.random() * 500)));

const userDataDir = mkdtempSync(path.join(tmpdir(), 'cdp-shot-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=1',
    // 本机系统代理会拦截 127.0.0.1（页面能开但资源 404 / 白屏），必须直连
    '--no-proxy-server',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    '--disable-features=Translate,BackForwardCache',
    url,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const origin = new URL(url).origin;

async function getTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      // 优先选真正加载了我们站点的那个 tab（无头 Chrome 可能同时存在多个 page target）
      const ours = pages.find((t) => String(t.url).startsWith(origin));
      const blank = pages.find((t) => String(t.url).startsWith('about:blank'));
      const pick = ours || blank || pages[0];
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (showConsole) {
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[page]', msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log('[page-error]', d.text, d.exception?.description || '');
    }
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
    throw new Error(JSON.stringify(r.exceptionDetails, null, 1));
  }
  return r.result?.value;
}

/** 可靠导航：反复尝试直到 location.href 真正落到目标地址（避免停在 about:blank） */
async function goto(target) {
  const base = target.split('#')[0];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await send('Page.navigate', { url: target });
    } catch {
      /* ignore */
    }
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      try {
        const href = await evaluate('String(location.href)');
        if (typeof href === 'string' && href.startsWith(base)) return;
        if (attempt === 3 && i % 6 === 0) console.log('[goto] href=', href);
      } catch (e) {
        if (attempt === 3 && i % 6 === 0) console.log('[goto] eval-fail', String(e).slice(0, 120));
      }
    }
  }
  throw new Error('页面导航失败：' + target);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await goto(url);

  if (downloadDir) {
    mkdirSync(downloadDir, { recursive: true });
    await send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.resolve(downloadDir),
      eventsEnabled: true,
    });
  }

  if (seedFile) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    for (const [k, v] of Object.entries(seed)) {
      await evaluate(
        `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`,
      );
    }
    // 必须重新 navigate 到目标 URL（而不是 reload）——
    // 首次访问若被重定向到别处，reload 会停在重定向后的页面。
    await goto(url);
  }

  await sleep(wait);

  const probe = evalFile ? readFileSync(evalFile, 'utf8') : evalJs;
  if (probe) {
    const v = await evaluate(probe);
    console.log('eval:', typeof v === 'string' ? v : JSON.stringify(v));
    await sleep(800);
  }

  // 真实向第一个 file input 传文件（用于走通头像上传全流程）
  if (uploadFile) {
    const handle = await send('Runtime.evaluate', {
      expression: "document.querySelector('input[type=file]')",
    });
    if (!handle.result?.objectId) {
      console.log('upload: NOT_FOUND input[type=file]');
    } else {
      await send('DOM.setFileInputFiles', {
        files: [path.resolve(uploadFile)],
        objectId: handle.result.objectId,
      });
      console.log('upload: OK ->', path.resolve(uploadFile));
      await sleep(1200);
    }
  }

  // 模拟真实鼠标悬停（用于验证 hover 才出现的控件）
  if (hoverText) {
    const box = await evaluate(`(() => {
      const t = ${JSON.stringify(hoverText)};
      // 优先匹配「模块步骤导航」项（role=button，文本前缀匹配）
      const navItems = Array.from(document.querySelectorAll('[role="button"]')).filter((e) => {
        const s = (e.textContent || '').trim();
        return s.startsWith(t) && s.length <= t.length + 4;
      });
      let el = navItems[0];
      if (!el) {
        el = Array.from(document.querySelectorAll('div,button,span')).find(
          (e) => (e.textContent || '').trim() === t,
        );
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (box) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
      console.log('hover:', JSON.stringify(box));
      await sleep(900);
    } else {
      console.log('hover: NOT_FOUND', hoverText);
    }
  }

  if (clickText) {
    const clicked = await evaluate(`(() => {
      const t = ${JSON.stringify(clickText)};
      const els = Array.from(document.querySelectorAll('button, a'));
      const el = els.find(e => (e.textContent || '').trim().includes(t));
      if (!el) return 'NOT_FOUND:' + els.map(e=>e.textContent.trim()).slice(0,40).join('|');
      el.scrollIntoView({block:'center'});
      el.click();
      return 'OK';
    })()`);
    console.log('click:', clicked);
    await sleep(clickWait);
  }

  if (click2Text) {
    const clicked2 = await evaluate(`(() => {
      const t = ${JSON.stringify(click2Text)};
      const els = Array.from(document.querySelectorAll('button, a'));
      const el = els.find(e => (e.textContent || '').trim().includes(t));
      if (!el) return 'NOT_FOUND:' + els.map(e=>e.textContent.trim()).slice(0,40).join('|');
      el.scrollIntoView({block:'center'});
      el.click();
      return 'OK';
    })()`);
    console.log('click2:', clicked2);
    await sleep(click2Wait);
  }

  if (evalFileAfter) {
    const v2 = await evaluate(readFileSync(evalFileAfter, 'utf8'));
    console.log('eval-after:', typeof v2 === 'string' ? v2 : JSON.stringify(v2));
  }

  const info = await evaluate(`(() => ({
    title: document.title,
    path: location.pathname,
    rootHtmlLen: document.getElementById('root')?.innerHTML.length ?? 0,
    bodyText: (document.body.innerText || '').slice(0, 600)
  }))()`);
  console.log('page:', JSON.stringify(info, null, 1));

  let clip;
  if (full) {
    const metrics = await send('Page.getLayoutMetrics');
    const cs = metrics.cssContentSize || metrics.contentSize;
    clip = { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 12000), scale: 1 };
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: Math.ceil(clip.height),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);
    clip = undefined;
  }

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: !!full,
    ...(clip ? { clip } : {}),
  });

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved:', out);
} finally {
  ws.close();
  chrome.kill();
}

/**
 * Resume-Pan 桌面端主进程（Electron）。
 *
 * 与 Web 版功能保持一致，导出链路整体平移：
 *  - Web 版的「本地渲染服务」（tools/export-service.mjs）依赖系统 Chrome 走 CDP
 *    Page.printToPDF；桌面端自带同款 Chromium 引擎，改为 **隐藏 BrowserWindow +
 *    webContents.printToPDF**，不依赖用户装没装 Chrome。
 *  - 主进程在 127.0.0.1:<port> 起一个本地服务，同时承担两件事：
 *      ① 静态托管 app/dist（生产构建，SPA history 回退到 index.html）；
 *      ② 提供 Web 版同款 API：GET /ping、GET /job/<id>、POST /export
 *        （渲染服务探活、批量导出、图片版栅格化的几何源都靠它）。
 *    UI 和服务同源，buildPrintDocument 产出的绝对地址无需改写即可加载。
 *  - 端口从 8790 起顺延探测，实际端口通过 preload 注入给渲染层
 *    （app/src/lib/serverExport.ts 优先读 window.desktopServiceUrl）。
 *
 * 启动模式：
 *  - 生产：npm start → electron .        （先 npm run build 出 dist）
 *  - 开发：npm run dev:vite + npm run dev（electron . --dev，加载 vite 5173，
 *          导出走 vite 插件拉起的 export-service，与 Web dev 完全一致）
 *  - 冒烟：electron . --smoke            （不显示窗口，仅起服务，供自动化测试）
 */
const { app, BrowserWindow, Menu, session, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST_DIR = path.join(__dirname, '..', 'app', 'dist');
const BASE_PORT = 8790;
const IS_DEV = process.argv.includes('--dev');
const IS_SMOKE = process.argv.includes('--smoke');

/* --------------------- 自定义数据存储文件夹（桌面端设置） --------------------- */
/* 简历数据存在 Chromium 的 Local Storage（leveldb）里，随 userData 目录走。
 * 用户在账号页选择新文件夹后写入 data-folder.json（固定放在**默认** userData，
 * 与当前是否已重定向无关），下次启动在此处应用重定向；migrate 标记触发一次性
 * 把默认目录的 Local Storage 复制过去（仅当目标还没有数据时，绝不覆盖）。 */
const DEFAULT_USER_DATA = app.getPath('userData');
const DATA_FOLDER_CONFIG = path.join(DEFAULT_USER_DATA, 'data-folder.json');

function readDataFolderConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(DATA_FOLDER_CONFIG, 'utf8'));
    if (cfg && typeof cfg.target === 'string' && path.isAbsolute(cfg.target)) return cfg;
  } catch { /* 无配置或损坏：按默认处理 */ }
  return null;
}

function applyCustomDataFolder() {
  const cfg = readDataFolderConfig();
  if (!cfg) return;
  try {
    if (cfg.migrate) {
      const src = path.join(DEFAULT_USER_DATA, 'Local Storage');
      const dst = path.join(cfg.target, 'Local Storage');
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.cpSync(src, dst, { recursive: true });
      }
      // 迁移只执行一次，写回不含 migrate 的配置
      fs.writeFileSync(DATA_FOLDER_CONFIG, JSON.stringify({ target: cfg.target }, null, 2));
    }
    fs.mkdirSync(cfg.target, { recursive: true });
    app.setPath('userData', cfg.target);
    console.log(`[desktop] 数据目录：${cfg.target}`);
  } catch (e) {
    console.error('[desktop] 自定义数据目录应用失败，使用默认目录：', e);
  }
}

/** 数据文件夹设置相关 IPC（在 app ready 后注册） */
function registerDataFolderIpc() {
  ipcMain.handle('data-folder:info', () => ({
    current: app.getPath('userData'),
    isDefault: path.normalize(app.getPath('userData')) === path.normalize(DEFAULT_USER_DATA),
    defaultPath: DEFAULT_USER_DATA,
  }));

  ipcMain.handle('data-folder:choose', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const res = await dialog.showOpenDialog(win, {
      title: '选择数据存储文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const target = res.filePaths[0];
    // 可写性校验（建删一个临时目录）
    const probe = path.join(target, '.resume-pan-probe');
    try {
      fs.mkdirSync(probe, { recursive: true });
      fs.rmSync(probe, { force: true });
    } catch {
      return { canceled: false, error: '该文件夹不可写，请换一个位置' };
    }
    return {
      canceled: false,
      target,
      isCurrent: path.normalize(target) === path.normalize(app.getPath('userData')),
      // 目标已有数据（Local Storage）时无法迁移，只能直接切换
      migrateAvailable: !fs.existsSync(path.join(target, 'Local Storage')),
    };
  });

  ipcMain.handle('data-folder:apply', async (_e, payload) => {
    const target = payload && typeof payload.target === 'string' ? payload.target : '';
    if (!target || !path.isAbsolute(target)) return { ok: false, error: '无效的文件夹路径' };
    try {
      fs.writeFileSync(
        DATA_FOLDER_CONFIG,
        JSON.stringify({ target, migrate: !!(payload && payload.migrate) }, null, 2),
      );
      app.relaunch();
      app.exit(0);
      return { ok: true, restarting: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  ipcMain.handle('data-folder:open', async () => {
    await shell.openPath(app.getPath('userData'));
    return true;
  });
}

let mainWindow = null;
let servicePort = 0; // 0 = 未启动（dev 模式走 vite 的渲染服务）

/* ------------------------------ PDF 元数据注入 ------------------------------ */
/* 与 tools/export-service.mjs 的 injectResumeMetadata 完全一致（增量更新法） */
function injectResumeMetadata(pdf, payload) {
  if (!payload) return pdf;
  try {
    const text = pdf.toString('latin1');
    if (text.lastIndexOf('startxref') < 0) return pdf;
    const rootMatch = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(text);
    if (!rootMatch) return pdf;
    const objNum = 9999001;
    const escaped = payload.replace(/[\\()]/g, (c) => `\\${c}`);
    const appendOffset = pdf.length;
    const addition = Buffer.from(
      `${objNum} 0 obj\n<< /Keywords (${escaped}) >>\nendobj\n` +
        `trailer\n<< /Size ${objNum + 1} /Root ${rootMatch[1]} ${rootMatch[2]} R ` +
        `/Info ${objNum} 0 R >>\nstartxref\n${appendOffset}\n%%EOF\n`,
      'latin1',
    );
    return Buffer.concat([pdf, addition]);
  } catch (e) {
    console.error('[desktop] 元数据注入失败（不影响导出）：', String(e).slice(0, 160));
    return pdf;
  }
}

/* ------------------------------ 隐藏窗口渲染 PDF ------------------------------ */
/* 等待逻辑与 export-service 的 Runtime.evaluate 一致：字体 → 图片 → 再一轮字体 → 稳定帧 */
const READY_SNIPPET = `(async () => {
  for (let i = 0; i < 100; i += 1) {
    if (document.readyState === 'complete' && document.querySelector('.resume-page')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  try { await document.fonts.ready; } catch {}
  await Promise.all(Array.from(document.images).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
  try { await document.fonts.ready; } catch {}
  await new Promise((r) => setTimeout(r, 350));
  return document.querySelectorAll('.resume-page').length;
})()`;

async function renderPdf(jobUrl) {
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    useContentSize: true,
    webPreferences: {
      // 隐藏窗口会被 Chromium 节流定时器/字体加载，必须关掉，否则导出挂死或字体缺失
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadURL(jobUrl);
    await win.webContents.executeJavaScript(READY_SNIPPET, true);
    const buf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(buf);
  } finally {
    try { win.destroy(); } catch { /* ignore */ }
  }
}

/* --------------------------------- 本地服务 --------------------------------- */
const jobs = new Map(); // '/job/<id>' -> html
let jobSeq = 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
};

function sendBuffer(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(res, pathname) {
  // 归一化并防目录穿越
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.normalize(path.join(DIST_DIR, rel));
  if (!filePath.startsWith(DIST_DIR)) {
    sendBuffer(res, 403, 'forbidden');
    return;
  }
  let target = filePath;
  let stat = null;
  try {
    stat = fs.statSync(target);
    if (stat.isDirectory()) { target = path.join(target, 'index.html'); stat = fs.statSync(target); }
  } catch {
    // SPA history 回退（/resumes、/editor 等前端路由）
    target = path.join(DIST_DIR, 'index.html');
    try { stat = fs.statSync(target); } catch { sendBuffer(res, 404, 'dist 未构建'); return; }
  }
  const ext = path.extname(target).toLowerCase();
  const immutable = rel.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  });
  fs.createReadStream(target).pipe(res);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > limit) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleExport(req, res) {
  try {
    const { html, filename, payload } = JSON.parse(await readBody(req));
    if (!html) throw new Error('missing html');
    const id = `j${(jobSeq += 1)}-${Date.now().toString(36)}`;
    jobs.set(`/job/${id}`, html);
    setTimeout(() => jobs.delete(`/job/${id}`), 120000);
    let pdf = await renderPdf(`http://127.0.0.1:${servicePort}/job/${id}`);
    if (payload) pdf = injectResumeMetadata(pdf, payload);
    sendBuffer(res, 200, pdf, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename || '简历')}.pdf"`,
    });
  } catch (e) {
    sendBuffer(res, 500, JSON.stringify({ error: String((e && e.message) || e) }), {
      'Content-Type': 'application/json',
    });
  }
}

function makeHandler() {
  return async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${servicePort || BASE_PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && url.pathname === '/ping') {
      sendBuffer(res, 200, JSON.stringify({ ok: true, desktop: true }), {
        'Content-Type': 'application/json',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/job/')) {
      const job = jobs.get(url.pathname);
      if (!job) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(job);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/export') {
      await handleExport(req, res);
      return;
    }

    if (req.method === 'GET') {
      serveStatic(res, url.pathname + (url.search || ''));
      return;
    }

    res.writeHead(404); res.end('not found');
  };
}

/**
 * 端口选择：优先复用上次记住的端口（localStorage 按 origin 隔离，
 * 端口一变用户数据就像「消失」了，所以必须保持 origin 稳定），
 * 记不住/被占用再从 8790 起顺延探测，避开 Web dev 的渲染服务。
 */
function portFilePath() {
  return path.join(app.getPath('userData'), 'service-port.txt');
}

function readRememberedPort() {
  try {
    const n = Number(fs.readFileSync(portFilePath(), 'utf8').trim());
    return n >= BASE_PORT && n < BASE_PORT + 100 ? n : 0;
  } catch {
    return 0;
  }
}

function startServer() {
  const handler = makeHandler();
  return new Promise((resolve, reject) => {
    const tried = new Set();
    const remembered = readRememberedPort();
    if (remembered) tried.add(remembered);
    for (let p = BASE_PORT; p < BASE_PORT + 6; p += 1) tried.add(p);
    const order = [remembered, ...[...tried].filter((p) => p !== remembered)].filter(Boolean);
    let i = 0;
    const attempt = () => {
      if (i >= order.length) { reject(new Error('8790-8795 端口均被占用')); return; }
      const port = order[i];
      i += 1;
      const server = http.createServer(handler);
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') attempt();
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => {
        try { fs.writeFileSync(portFilePath(), String(port)); } catch { /* ignore */ }
        resolve(port);
      });
    };
    attempt();
  });
}

/* --------------------------------- 应用窗口 --------------------------------- */
function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f6f8',
    title: 'Resume-Pan',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: servicePort ? [`--service-port=${servicePort}`] : [],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => {
    if (!IS_SMOKE) win.show();
  });
  // 生产没有菜单，保留 DevTools 快捷键便于排查
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });
  win.loadURL(url);
  win.on('closed', () => { mainWindow = null; });

  // 冒烟模式：加载完成后用 capturePage 截屏落盘并退出（供自动化验证 UI 渲染）。
  // --shot-steps=<base64(JSON)>：截图前执行的步骤序列，项为
  //   { "eval": "<页面内执行的 JS>" } 或 { "sleep": 毫秒 }（注入数据/点击交互用）。
  const shotArg = process.argv.find((a) => a.startsWith('--shot='));
  if (IS_SMOKE && shotArg) {
    const scrollArg = process.argv.find((a) => a.startsWith('--shot-scroll='));
    const stepsArg = process.argv.find((a) => a.startsWith('--shot-steps='));
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500)); // 等首屏渲染/字体
        if (stepsArg) {
          const steps = JSON.parse(Buffer.from(stepsArg.slice('--shot-steps='.length), 'base64').toString('utf8'));
          for (const st of steps) {
            if (typeof st.eval === 'string') {
              await win.webContents.executeJavaScript(st.eval, true);
            } else if (typeof st.sleep === 'number') {
              await new Promise((r) => setTimeout(r, st.sleep));
            }
          }
        }
        if (scrollArg) {
          const target = scrollArg.slice('--shot-scroll='.length);
          await win.webContents.executeJavaScript(
            `window.scrollTo(0, ${target === 'bottom' ? 'document.body.scrollHeight' : target}); 'scrolled'`,
            true,
          );
          await new Promise((r) => setTimeout(r, 800));
        }
        const img = await win.webContents.capturePage();
        require('node:fs').writeFileSync(shotArg.slice(7), img.toPNG());
        console.log(`[desktop-smoke] shot saved: ${shotArg.slice(7)}`);
        // 若步骤脚本在 localStorage 里留过备份键（xl-shot-backup 或 *-test-backup），
        // 恢复原始数据再退出。键名通用匹配，避免步骤脚本与主进程约定不一致漏恢复。
        await win.webContents.executeJavaScript(
          `(function(){
            var keys = Object.keys(localStorage).filter(function (k) { return k === 'xl-shot-backup' || /-test-backup$/.test(k); });
            if (keys.length) {
              var b = localStorage.getItem(keys[0]);
              if (b === '') localStorage.removeItem('xl-resume-data');
              else if (b !== null) localStorage.setItem('xl-resume-data', b);
              keys.forEach(function (k) { localStorage.removeItem(k); });
            }
            return 'restored';
          })()`,
          true,
        );
      } catch (e) {
        console.error('[desktop-smoke] shot failed:', e);
      } finally {
        app.quit();
      }
    });
  }
  mainWindow = win;
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 必须在 ready 之前重定向 userData（Local Storage 随目录走）
  applyCustomDataFolder();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerDataFolderIpc();

    // File System Access API（批量导出选文件夹）在 Electron 里需要显式授权
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['fileSystem', 'clipboard-sanitized-write'].includes(permission));
    });

    if (!IS_DEV && !IS_SMOKE) Menu.setApplicationMenu(null);

    if (IS_DEV) {
      // dev：vite dev server（npm run dev:vite）+ vite 插件拉起的渲染服务，与 Web 一致
      createWindow('http://127.0.0.1:5173/');
    } else {
      try {
        servicePort = await startServer();
        createWindow(`http://127.0.0.1:${servicePort}/`);
        if (IS_SMOKE) console.log(`[desktop-smoke] ready on http://127.0.0.1:${servicePort}`);
      } catch (e) {
        dialog.showErrorBox('Resume-Pan 启动失败', `本地服务启动失败：\n${String(e)}`);
        app.quit();
      }
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

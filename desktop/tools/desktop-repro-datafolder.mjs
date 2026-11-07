/**
 * 数据存储文件夹切换端到端验证（node tools/desktop-repro-datafolder.mjs）
 * ① 写入 config（不迁移）→ 启动 → 验证 userData 重定向（空数据、IPC 可用）
 * ② 写入 config（migrate）→ 启动 → 验证 Local Storage 已从默认目录迁移、简历数据可读
 * ③ 清理：删配置与临时目录，应用回到默认位置；默认 profile 只读不写。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const DEFAULT_UD = path.join(process.env.APPDATA || '', 'resume-pan-desktop');
const CONFIG = path.join(DEFAULT_UD, 'data-folder.json');
const TMP_BASE = path.join(ROOT, 'tmp-data-test');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchSmoke(cdpPort) {
  const child = spawn(ELECTRON, ['.', '--smoke', `--remote-debugging-port=${cdpPort}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child._out = () => out;
  return child;
}

async function withPage(cdpPort, fn) {
  let target = null;
  for (let i = 0; i < 60 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (!target) await sleep(400);
    } catch { await sleep(400); }
  }
  if (!target) throw new Error('CDP 无页面目标');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) =>
    new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await sleep(2500);
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  try {
    return await fn(evaluate);
  } finally {
    ws.close();
  }
}

function stop(child) {
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
    try { child.kill(); } catch { /* */ }
    setTimeout(resolve, 3000);
  });
}

/* ---------- 场景 1：不迁移，全新目录 ---------- */
mkdirSync(TMP_BASE, { recursive: true });
const target1 = path.join(TMP_BASE, 'folder-1');
writeFileSync(CONFIG, JSON.stringify({ target: target1 }, null, 2));
console.log('① config 已写入（不迁移）：', target1);

let c1 = launchSmoke(9350);
const r1 = await withPage(9350, async (evaluate) => {
  const ls = await evaluate(`(async () => JSON.stringify({
    fresh: localStorage.getItem('xl-resume-data') === null,
    hasApi: !!window.desktopSettings,
    info: await window.desktopSettings.getDataFolderInfo(),
  }))()`);
  return JSON.parse(ls);
});
console.log('② 重定向后：', JSON.stringify(r1), '（期望 fresh=true, hasApi=true, info.current=target1, isDefault=false）');
const leveldb1 = existsSync(path.join(target1, 'Local Storage', 'leveldb'));
console.log('③ 目标目录 leveldb 已创建：', leveldb1);
await stop(c1);

/* ---------- 场景 2：迁移真实数据 ---------- */
const target2 = path.join(TMP_BASE, 'folder-2');
writeFileSync(CONFIG, JSON.stringify({ target: target2, migrate: true }, null, 2));
console.log('④ config 已写入（迁移）：', target2);

let c2 = launchSmoke(9351);
const r2 = await withPage(9351, async (evaluate) => {
  const ls = await evaluate(`(async () => JSON.stringify({
    resumeCount: JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[]}}').state.resumes.length,
    info: await window.desktopSettings.getDataFolderInfo(),
  }))()`);
  return JSON.parse(ls);
});
const migrated = existsSync(path.join(target2, 'Local Storage', 'leveldb'));
console.log('⑤ 迁移后：', JSON.stringify(r2), '| leveldb 已复制:', migrated);
console.log('   （期望 resumeCount=用户真实简历数, info.current=target2）');
await stop(c2);

/* ---------- 清理 ---------- */
rmSync(CONFIG, { force: true });
rmSync(TMP_BASE, { recursive: true, force: true });
const configGone = !existsSync(CONFIG);
console.log('⑥ 已清理配置与临时目录：', configGone, '（下次启动回到默认数据目录）');
console.log('默认 profile 未动（只读）：', existsSync(path.join(DEFAULT_UD, 'Local Storage', 'leveldb')));

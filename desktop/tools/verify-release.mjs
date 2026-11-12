#!/usr/bin/env node
/**
 * 产物自检（打包后运行）：
 *  1) Windows bundle： exe --smoke 起本地服务 -> /ping -> POST /export 校验返回 PDF
 *  2) 绿色 7z：解包 -> 运行 -> 校验数据落在解压目录 data/（便携语义）
 *  3) 各资产魔数 / 结构静态校验（Linux 包无法在 Windows 实机跑，只做格式校验）
 * 报告写入 .build-env/out/verify-report.json；不修改 releases/v<版本>/ 里的资产。
 * 可用 --version=x.y.z 指定要自检的历史版本目录。
 * 运行 exe 时的 TMP/TEMP 也指向项目内，避免 Chromium 往 C 盘写临时文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.find((x) => x.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice('--out='.length) : '.build-env/out');
// 与 make-release.mjs 一致：按版本归档；--version=x.y.z 可自检历史版本
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const verArg = process.argv.find((x) => x.startsWith('--version='));
const VERSION = verArg ? verArg.slice('--version='.length) : pkg.version;
const RELEASE = path.join(ROOT, 'releases', `v${VERSION}`);
const report = { checks: [], ok: true, notes: [] };

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
// 与 pack-release.mjs 保持一致：运行期临时文件全部落在项目内
const envTmp = path.join(ROOT, '.build-env', 'tmp');
fs.mkdirSync(envTmp, { recursive: true });
cleanEnv.TMP = envTmp;
cleanEnv.TEMP = envTmp;
cleanEnv.TMPDIR = envTmp;
cleanEnv.ELECTRON_BUILDER_CACHE = path.join(ROOT, '.build-env', 'cache', 'builder');
cleanEnv.npm_config_cache = path.join(ROOT, '.build-env', 'cache', 'npm');

function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
  if (!ok) report.ok = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function waitForPing(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let p = 8790; p <= 8795; p += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${p}/ping`, { signal: AbortSignal.timeout(1200) });
        if (r.ok) {
          const j = await r.json();
          if (j.ok) return p;
        }
      } catch { /* 端口未就绪 */ }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return 0;
}

async function probeExport(port) {
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<div class="resume-page" style="width:794px;height:1123px;padding:40px;font:16px sans-serif">' +
    'Resume-Pan release verification</div></body></html>';
  const r = await fetch(`http://127.0.0.1:${port}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename: 'verify' }),
    signal: AbortSignal.timeout(60000),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, head: buf.subarray(0, 5).toString('latin1'), size: buf.length };
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function runBundle(exe, cwd, label, expectPortableData) {
  if (!fs.existsSync(exe)) { check(label, false, `找不到 ${exe}`); return; }
  const child = spawn(exe, ['--smoke'], { cwd, env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString().slice(0, 500); });
  try {
    const port = await waitForPing();
    check(`${label} /ping`, port > 0, port ? `端口 ${port}` : '本地服务未就绪');
    if (!port) return;
    const pdf = await probeExport(port);
    check(`${label} /export 生成 PDF`, pdf.status === 200 && pdf.head === '%PDF-',
      `status=${pdf.status} head=${pdf.head} size=${pdf.size}`);
    if (expectPortableData) {
      const dataDir = path.join(path.dirname(exe), 'data');
      check(`${label} 便携数据目录`, fs.existsSync(dataDir),
        fs.existsSync(dataDir) ? dataDir : '未生成 data/（portable.txt 未生效？）');
    }
  } catch (e) {
    check(label, false, String(e && e.message || e));
  } finally {
    killTree(child);
    if (stderr) report.notes.push(`${label} stderr: ${stderr.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 600));
  }
}

function magic(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(16);
  fs.readSync(fd, b, 0, 16, 0);
  fs.closeSync(fd);
  return b;
}

function staticChecks() {
  if (!fs.existsSync(RELEASE)) return;
  const expects = [
    [/-Setup\.exe$/, (b) => b.subarray(0, 2).toString('latin1') === 'MZ', 'PE/MZ'],
    [/green\.7z$/, (b) => b.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])), '7z'],
    [/\.deb$/, (b) => b.subarray(0, 8).toString('latin1') === '!<arch>\n', 'ar 归档'],
    [/\.AppImage$/, (b) => b.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'ELF'],
    [/\.pacman$/, (b) => b.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])) ||
      b.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])), 'zstd/xz tar'],
    [/\.tar\.xz$/, (b) => b.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])), 'XZ'],
    [/\.dmg$/, (b) => b.length > 0, 'dmg'],
  ];
  for (const f of fs.readdirSync(RELEASE)) {
    const p = path.join(RELEASE, f);
    if (!fs.statSync(p).isFile()) continue;
    const hit = expects.find(([re]) => re.test(f));
    if (!hit) continue;
    const b = magic(p);
    check(`格式 ${f}`, hit[1](b), `${hit[2]}，${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB`);
  }
}

/** 逐架构独立构建后 bundle 在 .build-env/out/<arch>/win-unpacked 里，需递归查找。 */
function collectBundles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    // 文件锁失败会留下空的 *-unpacked 目录，跳过（否则会误报「找不到 exe」）
    if (/^win.*unpacked/i.test(e.name) && !/tmp$/i.test(e.name) &&
        fs.existsSync(path.join(p, 'Resume-Pan.exe'))) acc.push(p);
    else if (!/^(_|\.)/.test(e.name)) collectBundles(p, acc);
  }
  return acc;
}

async function main() {
  console.log('=== Windows bundle 自检 ===');
  const bundles = collectBundles(OUT);
  for (const dir of bundles) {
    const exe = path.join(dir, 'Resume-Pan.exe');
    if (/arm64/i.test(path.basename(dir))) {
      report.notes.push(`跳过 ${path.basename(dir)} 的运行自检：x64 主机无法执行 arm64 二进制（仅做格式校验）`);
      continue;
    }
    await runBundle(exe, dir, path.basename(dir), false);
  }

  console.log('\n=== 绿色便携版自检 ===');
  const green = fs.existsSync(RELEASE)
    ? fs.readdirSync(RELEASE).find((f) => /win_x64-green\.7z$/.test(f))
    : null;
  if (green) {
    // 不用「删旧目录再建」：解压后的 bundle 有数百个文件，会触发宿主批量删除保护。
    // 每次换新目录名，全部留在项目内 .build-env/out/。
    let extractDir = path.join(OUT, '_verify-green');
    let n = 2;
    while (fs.existsSync(extractDir)) extractDir = path.join(OUT, `_verify-green-${n++}`);
    fs.mkdirSync(extractDir, { recursive: true });
    const sevenZip = require('7zip-bin').path7za;
    const r = spawnSync(sevenZip, ['x', '-y', `-o${extractDir}`, path.join(RELEASE, green)],
      { stdio: 'ignore', windowsHide: true });
    check('绿色版解压', r.status === 0, `7za exit=${r.status}`);
    if (r.status === 0) {
      check('绿色版含 portable.txt', fs.existsSync(path.join(extractDir, 'portable.txt')), '便携标记');
      await runBundle(path.join(extractDir, 'Resume-Pan.exe'), extractDir, 'green-x64', true);
    }
  } else {
    report.notes.push('未找到 win_x64-green.7z，跳过绿色版自检');
  }

  console.log('\n=== 资产格式校验 ===');
  staticChecks();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n结果：${report.ok ? '全部通过' : '存在失败项'}（${report.checks.length} 项）`);
  console.log(`报告：${path.join(OUT, 'verify-report.json')}`);
  if (report.notes.length) console.log('备注：\n  - ' + report.notes.join('\n  - '));
  process.exitCode = report.ok ? 0 : 1;
}

main();

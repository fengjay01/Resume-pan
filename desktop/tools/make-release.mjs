#!/usr/bin/env node
/**
 * 把 electron-builder 的原始产物整理成可直接上传到 Release 的资产：
 *  - 命名对齐常见 Electron Release：Setup.exe / .exe.blockmap / win_<arch>-green.7z
 *  - 用 <arch>/win-*-unpacked 打绿色便携 7z，并注入 portable.txt
 *  - 产出 SHA256SUMS.txt 与 manifest.json（大小 / 校验和 / 平台 / 架构 / 类型）
 *
 * 【目录分层】读取 .build-env/out/<arch>/ 下的原始产物，只把最终资产写进
 * releases/<版本>/（按版本归档；升级时改 package.json 的 version 即自动新建目录）。
 * 逐架构独立构建后每个子目录各有一份 latest.yml / builder-debug.yml，按架构改名避免覆盖。
 * 可重复运行：原始产物保留在 .build-env/out/，整理步骤随时可重跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.find((x) => x.startsWith('--out='));
const OUT = path.join(ROOT, outArg ? outArg.slice('--out='.length) : '.build-env/out');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
// 【按版本归档】最终资产统一放 desktop/releases/<版本>/。
// 升级迭代只需改 package.json 的 version 再跑 pack:win，会自动新建对应目录；
// 历史版本目录原样保留，互不覆盖。
const RELEASE = path.join(ROOT, 'releases', VERSION);
const ONLY = (() => {
  const a = process.argv.find((x) => x.startsWith('--only='));
  return a ? a.slice('--only='.length) : 'all';
})();

const failuresFile = path.join(OUT, '_failures.json');
const renameMap = new Map();   // 原文件名 -> 发布文件名
const files = [];              // 发布清单

function log(...a) { console.log('[release]', ...a); }
function warn(...a) { console.warn('[release][warn]', ...a); }

function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}

function publish(src, dest, info) {
  const dst = path.join(RELEASE, dest);
  if (fs.existsSync(dst)) fs.rmSync(dst, { force: true });
  // 复制而非移动：保留 .build-env/out 里的原始产物，整理步骤可反复重跑 / 排错。
  fs.copyFileSync(src, dst);
  renameMap.set(path.basename(src), dest);
  files.push({ name: dest, size: fs.statSync(dst).size, sha256: sha256(dst), ...info });
  log(`${dest}  (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
}

function archOf(name, fallback = 'x64') {
  const m = /(arm64|aarch64|armv7l|x64|amd64|ia32|x86|universal)/i.exec(name);
  if (!m) return fallback;
  const a = m[1].toLowerCase();
  if (a === 'amd64' || a === 'x64') return 'x64';
  if (a === 'aarch64') return 'arm64';
  if (a === 'x86' || a === 'ia32') return 'ia32';
  return a;
}

function classify(file) {
  const name = path.basename(file);
  const low = name.toLowerCase();
  // 输出目录可能是 x64 / x64-2 / x64/retry 等（文件锁时自动换目录），从相对路径提取架构
  const rel = path.relative(OUT, file).replace(/\\/g, '/');
  const archTag = /(?:^|\/)(x64|arm64|ia32)(?:-|\/|$)/i.exec(rel)?.[1]?.toLowerCase() ?? null;
  // 多架构 NSIS 会额外产出一个不带架构后缀的双架构包，它是 universal 而非 x64。
  // 现在逐架构独立构建不会再出现，但保留识别避免误覆盖。
  const hasArch = /(arm64|aarch64|armv7l|x64|amd64|ia32|x86|universal)/i.test(name);
  const arch = hasArch ? archOf(name) : (archTag ?? 'universal');
  if (low.endsWith('.exe.blockmap')) {
    return { dest: `${NAME}-${VERSION}-${arch}-Setup.exe.blockmap`, info: { platform: 'win', arch, kind: 'blockmap' } };
  }
  if (low.endsWith('.exe')) {
    return { dest: `${NAME}-${VERSION}-${arch}-Setup.exe`, info: { platform: 'win', arch, kind: 'nsis' } };
  }
  if (/^(latest|builder-debug).*\.yml$/i.test(name)) {
    const tag = archTag ? `-${archTag}` : '';
    return { dest: `${name.replace(/\.yml$/i, '')}${tag}.yml`, info: { platform: 'meta', arch: 'all', kind: 'metadata' } };
  }
  if (low.endsWith('.deb')) {
    const debArch = arch === 'arm64' ? 'arm64' : arch === 'ia32' ? 'i386' : 'amd64';
    return { dest: `${NAME}_${VERSION}_${debArch}.deb`, info: { platform: 'linux', arch, kind: 'deb' } };
  }
  if (low.endsWith('.appimage')) {
    return { dest: `${NAME}_${VERSION}_${arch}.AppImage`, info: { platform: 'linux', arch, kind: 'appimage' } };
  }
  if (low.endsWith('.tar.xz') || low.endsWith('.tar.gz')) {
    const ext = low.endsWith('.tar.xz') ? 'tar.xz' : 'tar.gz';
    return { dest: `${NAME}_${VERSION}_${arch}.${ext}`, info: { platform: 'linux', arch, kind: 'archive' } };
  }
  return null;
}

/** 递归收集构建输出（跳过 unpacked 内部 / 自检 / 失败记录等非资产文件）。 */
function collectBuildFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(_|\.)/.test(e.name) || /unpacked/i.test(e.name)) continue;
      collectBuildFiles(p, acc);
      continue;
    }
    if (/^(_failures\.json|verify-report\.json)$/.test(e.name)) continue;
    acc.push(p);
  }
  return acc;
}

/** 递归找 win-*-unpacked bundle；架构以 <arch>/ 子目录名为准（单架构 bundle 都叫 win-unpacked）。 */
function collectBundles(dir, archHint = null, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    const hint = /(x64|arm64|ia32)/i.exec(e.name)?.[1]?.toLowerCase() ?? archHint;
    if (/^win.*unpacked/i.test(e.name) && !/tmp$/i.test(e.name)) {
      acc.push({ bundle: p, arch: hint || (/arm64/i.test(e.name) ? 'arm64' : 'x64') });
    } else if (!/^(_|\.)/.test(e.name)) {
      collectBundles(p, hint, acc);
    }
  }
  return acc;
}

/** 绿色便携版：在 bundle 根目录注入 portable.txt 后用 7za 最高级别压缩。 */
function buildGreenArchives() {
  const bundles = collectBundles(OUT);
  if (!bundles.length) return;
  // 同一架构可能有多个 bundle（试打包残留），只保留 mtime 最新的那个。
  const byArch = new Map();
  for (const { bundle, arch } of bundles) {
    const mtime = fs.statSync(bundle).mtimeMs;
    const prev = byArch.get(arch);
    if (!prev || mtime > prev.mtime) byArch.set(arch, { bundle, mtime });
  }

  let sevenZip = null;
  try { sevenZip = require('7zip-bin').path7za; } catch {
    warn('找不到 7zip-bin，跳过 green.7z'); return;
  }
  if (!fs.existsSync(sevenZip)) { warn(`7za 不存在：${sevenZip}`); return; }

  for (const [arch, { bundle }] of byArch) {
    if (!fs.existsSync(path.join(bundle, 'resources', 'app.asar'))) {
      warn(`${path.basename(bundle)} 缺少 resources/app.asar，跳过绿色版`);
      continue;
    }
    const dest = `${NAME}-${VERSION}-win_${arch}-green.7z`;
    const out = path.join(RELEASE, dest);
    const marker = path.join(bundle, 'portable.txt');
    const dataDir = path.join(bundle, 'data');
    fs.writeFileSync(marker,
      'Resume-Pan 绿色便携版标记（请勿删除）\n' +
      '存在本文件时，简历数据保存在同级 data/ 目录，整个文件夹可拷走。\n');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, '数据存放说明.txt'),
      '简历数据（Local Storage、端口记忆、设置）保存在本目录。\n' +
      '删除本目录等同于删除全部简历，请先在账号页导出 JSON 备份。\n');
    log(`压缩绿色版 ${path.basename(bundle)} -> ${dest} ...`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    // -mx=9 最高压缩 + -ms=on 固实归档：Electron 运行时重复二进制能显著合并去重
    const r = spawnSync(sevenZip, ['a', '-t7z', '-mx=9', '-ms=on', '-r', out, '.'], {
      cwd: bundle, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true,
    });
    fs.rmSync(marker, { force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (r.status !== 0 || !fs.existsSync(out)) {
      warn(`绿色版压缩失败：${path.basename(bundle)}（7za exit=${r.status}）`);
      continue;
    }
    files.push({ name: dest, size: fs.statSync(out).size, sha256: sha256(out),
      platform: 'win', arch, kind: 'green-7z' });
    log(`${dest}  (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function main() {
  fs.mkdirSync(RELEASE, { recursive: true });
  // 清掉上一轮整理结果（只删文件，不动子目录）
  for (const f of fs.readdirSync(RELEASE)) {
    const p = path.join(RELEASE, f);
    if (fs.statSync(p).isFile()) fs.rmSync(p, { force: true });
  }

  // 逐架构构建会自动避让被文件锁占用的目录（x64 / x64-2 / x64-3 ...），
  // 旧轮次目录里残留着同名产物。按发布文件名去重，只保留 mtime 最新的一份：
  // 既避免 manifest 出现重复条目，也防止上一轮的文件覆盖本轮产物。
  const selected = new Map();
  for (const file of collectBuildFiles(OUT)) {
    const name = path.basename(file);
    const c = classify(file);
    if (!c) { log(`跳过未识别产物：${name}`); continue; }
    if (ONLY !== 'all' && c.info.platform !== ONLY && c.info.platform !== 'meta') {
      log(`跳过非 ${ONLY} 资产：${name}`); continue;
    }
    const mtime = fs.statSync(file).mtimeMs;
    const prev = selected.get(c.dest);
    if (!prev || mtime > prev.mtime) selected.set(c.dest, { file, c, mtime });
  }
  for (const { file, c } of selected.values()) publish(file, c.dest, c.info);

  buildGreenArchives();

  // latest*.yml / builder-debug*.yml 里的 path 指向重命名前的名字，同步替换
  for (const f of fs.readdirSync(RELEASE)) {
    if (!/^(latest.*|builder-debug.*)\.yml$/i.test(f)) continue;
    const p = path.join(RELEASE, f);
    let text = fs.readFileSync(p, 'utf8');
    for (const [from, to] of [...renameMap.entries()].sort((a, b) => b[0].length - a[0].length)) {
      text = text.split(from).join(to);
    }
    fs.writeFileSync(p, text);
  }

  const sums = files.filter((f) => f.kind !== 'metadata')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `${f.sha256}  ${f.name}`).join('\n') + '\n';
  fs.writeFileSync(path.join(RELEASE, 'SHA256SUMS.txt'), sums);

  let failures = [];
  if (fs.existsSync(failuresFile)) {
    try { failures = JSON.parse(fs.readFileSync(failuresFile, 'utf8')); } catch { /* ignore */ }
  }
  const electronVersion = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/electron/package.json'), 'utf8')).version; }
    catch { return 'unknown'; }
  })();
  const manifest = {
    product: NAME,
    version: VERSION,
    electron: electronVersion,
    generatedAt: new Date().toISOString(),
    platforms: [...new Set(files.map((f) => f.platform).filter((p) => p !== 'meta'))].sort(),
    architectures: [...new Set(files.map((f) => f.arch).filter((a) => a !== 'all'))].sort(),
    count: files.length,
    files,
    failedTargets: failures,
  };
  fs.writeFileSync(path.join(RELEASE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`完成：${files.length} 个资产，platforms=${manifest.platforms.join(',')}，archs=${manifest.architectures.join(',')}`);
  if (failures.length) warn(`未成功的目标：${failures.join(', ')}`);
}

main();

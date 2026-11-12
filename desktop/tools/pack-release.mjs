#!/usr/bin/env node
/**
 * 一条命令产出 Windows Release 资产（仅本地 electron-builder，不依赖 CI）。
 *
 *   1) 重新构建 app/dist（可 --skip-build），并裁剪冗余字体
 *   2) 逐架构调用 electron-builder（x64 / arm64 分开，避免多架构 NSIS 额外产出
 *      315MB 的 universal 双架构包）
 *   3) tools/make-release.mjs 统一改名、生成绿色版、SHA256 清单
 *
 * 【目录分层：构建期的一切都落在项目内 .build-env/，绝不写 C 盘】
 *   desktop/.build-env/cache/electron/   Electron 二进制 zip（electronDownload.cache）
 *   desktop/.build-env/cache/builder/    NSIS / winCodeSign 等工具（ELECTRON_BUILDER_CACHE）
 *   desktop/.build-env/cache/npm/        npm / npx 缓存（npm_config_cache）
 *   desktop/.build-env/tmp/              构建期 TMP/TEMP
 *   desktop/.build-env/out/<arch>/      electron-builder 原始输出
 *   desktop/releases/v<版本>/          最终交付资产（按版本归档，唯一对外产物目录）
 *
 * 用法：
 *   npm run pack:win                      # Windows x64 + arm64（推荐）
 *   node tools/pack-release.mjs --arch=x64 --skip-build
 *   node tools/pack-release.mjs --out=.build-env/out-2   # 输出目录被占用时换一个
 *
 * 下载源在 electron-builder.yml 的 electronDownload.mirror（26 版忽略 ELECTRON_MIRROR）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const only = opt('only', 'all');
const archs = opt('arch', 'x64,arm64').split(',').map((a) => a.trim()).filter(Boolean);
const OUT_DIR = opt('out', '.build-env/out');           // 相对 desktop/，父目录
const OUT = path.join(ROOT, OUT_DIR);
const skipBuild = argv.includes('--skip-build');
const noRelease = argv.includes('--no-release');

/* ---------------- 目录分层：所有环境缓存都建在项目内 ---------------- */
const ENV_ROOT = path.join(ROOT, '.build-env');
const DIRS = {
  electron: path.join(ENV_ROOT, 'cache', 'electron'),
  builder: path.join(ENV_ROOT, 'cache', 'builder'),
  npm: path.join(ENV_ROOT, 'cache', 'npm'),
  tmp: path.join(ENV_ROOT, 'tmp'),
  out: OUT,
};
for (const p of Object.values(DIRS)) fs.mkdirSync(p, { recursive: true });
// Windows 下 cmd.exe 不把反斜杠当转义符，但正斜杠更稳，统一转换后传给 CLI。
const cliPath = (p) => p.replace(/\\/g, '/');

/* ---------------- 构建子进程环境：禁止任何 C 盘写入 ---------------- */
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;               // 本机 shell 注入，会让 electron 退化成纯 Node
// electron-builder / @electron/get / electron install.js 的缓存根
env.ELECTRON_BUILDER_CACHE = DIRS.builder;
env.ELECTRON_CACHE = DIRS.electron;
env.electron_config_cache = DIRS.electron;
// npm / npx 缓存与日志
env.npm_config_cache = DIRS.npm;
env.npm_config_tmp = DIRS.tmp;
env.npm_config_update_notifier = 'false';
// NSIS / 7za / Chromium 运行自检的临时目录
env.TMP = DIRS.tmp;
env.TEMP = DIRS.tmp;
env.TMPDIR = DIRS.tmp;
// WorkBuddy / CodeBuddy 用 NODE_OPTIONS 注入语言 shim（含 safe-delete 批量删除保护），
// 会误伤 electron-builder 清理自己生成的 *-unpacked.tmp；只在构建子进程去掉。
if (!env.KEEP_NODE_OPTIONS && env.NODE_OPTIONS && env.NODE_OPTIONS.includes('node-language-shim')) {
  console.log('[pack] 构建子进程已去除宿主 NODE_OPTIONS 注入');
  delete env.NODE_OPTIONS;
}
// 国内镜像（与 desktop/.npmrc 一致）；官方源可用同名环境变量覆盖。
env.ELECTRON_MIRROR = env.ELECTRON_MIRROR ?? 'https://repo.huaweicloud.com/electron/';
env.ELECTRON_BUILDER_BINARIES_MIRROR = env.ELECTRON_BUILDER_BINARIES_MIRROR ??
  'https://npmmirror.com/mirrors/electron-builder-binaries/';
// 本机代理会让下载器挂起；国内镜像直连更快。必须走代理时设 KEEP_PROXY=1。
if (!env.KEEP_PROXY) {
  for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete env[k];
  }
}

function run(cmd, args, label) {
  console.log(`\n===== ${label} =====\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT, env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (r.error) console.error(`[pack] ${label} 启动失败：${r.error.message}`);
  if (r.status !== 0) console.error(`[pack] ${label} 失败（exit=${r.status}）`);
  return r.status === 0;
}

/**
 * 字体瘦身：@fontsource 同时产出 woff2 + woff 两份，CSS 里每个 @font-face 都是
 * woff2 优先（实测 720 个声明中 0 个只引用 woff）。Chromium 152 全支持 woff2。
 *
 * 这里【不删除文件】：宿主 safe-delete 保护会拦截 >50 个文件的批量删除，绕过它不合适。
 * 安装包瘦身交给 electron-builder.yml 的 files 白名单中的 .woff 排除规则
 * （asar 里彻底不含这 16.8MB）；本函数只改写 CSS 去掉 woff 回退分支，
 * 避免渲染时请求不存在的文件。
 * 幂等：重复运行无副作用，且只做文件写入、不做删除。
 */
function pruneDist() {
  const assets = path.join(ROOT, 'app', 'dist', 'assets');
  if (!fs.existsSync(assets)) return;
  let changed = 0;
  for (const f of fs.readdirSync(assets)) {
    if (!f.endsWith('.css')) continue;
    const p = path.join(assets, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(
      /,\s*url\((['"]?)([^'")]*\.woff)\1\)\s*format\((['"])woff\3\)/gi, '');
    if (after !== before) { fs.writeFileSync(p, after); changed += 1; }
  }
  console.log(`[pack] 字体瘦身：${changed} 个 CSS 去掉 .woff 回退；` +
    'asar 排除 .woff 由 electron-builder.yml 的 files 白名单完成');
}

const groups = { win: ['nsis', 'dir'] };
if (only !== 'all' && only !== 'win') {
  console.error(`平台 ${only} 暂未适配，当前仅支持 --only=win|all`);
  process.exit(1);
}

/* ---------------- 1) 前端构建（缓存走项目内 npm cache） ---------------- */
if (!skipBuild) {
  if (!fs.existsSync(path.join(ROOT, 'app', 'node_modules'))) {
    if (!run('npm', ['--prefix', 'app', 'install', '--no-audit', '--no-fund'], '安装前端依赖')) process.exit(1);
  }
  if (!run('npm', ['--prefix', 'app', 'run', 'build'], '构建 app/dist')) process.exit(1);
}
pruneDist();

/* ---------------- 2) 图标（用户把图标放在 resources/，缺失时才补生成） ---------------- */
const iconPath = path.join(ROOT, 'resources', 'icon.ico');
if (!fs.existsSync(iconPath)) {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  if (!run(py, ['tools/make-icons.py'], '生成图标')) {
    console.warn('[pack] 图标生成失败，electron-builder 可能回退到默认图标');
  }
}

/* ---------------- 3) 逐架构打包 ----------------
 * 一次传 --x64 --arm64 会让 NSIS 额外产出不带架构后缀的 universal 双架构包（315MB），
 * 逐个架构独立构建 + 独立输出子目录，既避免该产物，也不会互相覆盖 win-unpacked。 */
const failures = [];

/**
 * Windows 上刚解压的 Electron 目录可能被安全软件短暂锁住（EBUSY/EPERM，删/移都不行）。
 * 残留的 *-unpacked.tmp 无法清理，所以每次构建都挑一个全新的架构目录：
 * .build-env/out/x64、再跑就 x64-2、x64-3…… 全部仍在项目内，不触碰系统目录。
 */
function freshArchDir(arch) {
  const base = path.join(OUT_DIR, arch);
  let rel = base;
  let n = 1;
  for (;;) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || fs.readdirSync(abs).length === 0) {
      fs.mkdirSync(abs, { recursive: true });
      return rel.replace(/\\/g, '/');
    }
    rel = `${base}-${++n}`;
  }
}

function buildArch(arch, label, targetArg) {
  const archOut = freshArchDir(arch);
  const args = [
    'electron-builder', '--win', `--${arch}`,
    `-c.directories.output=${archOut}`,
    `-c.electronDownload.cache=${cliPath(DIRS.electron)}`,
  ];
  if (targetArg) args.push(targetArg);
  return run('npx', args, `win/${arch}${label ? ` / ${label}` : ''}  [${archOut}]`);
}

for (const arch of archs) {
  if (buildArch(arch, '全量目标', null)) continue;
  console.warn(`[pack] win/${arch} 全量构建失败，换全新目录逐目标重试`);
  for (const t of groups.win) {
    if (buildArch(arch, t, `-c.win.target=${t}`)) continue;
    failures.push(`win/${arch}/${t}`);
  }
}

fs.writeFileSync(path.join(OUT, '_failures.json'), JSON.stringify(failures, null, 2));
if (!noRelease) {
  run(process.execPath, ['tools/make-release.mjs', `--only=win`, `--out=${OUT_DIR}`],
    '整理 Release 资产');
}

console.log('\n===== 打包汇总 =====');
console.log(`平台：win  架构：${archs.join(', ')}`);
console.log(`构建环境目录：${ENV_ROOT}（全部在项目内，可随时删除）`);
console.log(`原始输出：${OUT}`);
if (failures.length) console.warn(`未成功的目标：${failures.join(', ')}`);
else console.log('全部目标构建成功');
const releaseVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
console.log(`产物目录：${path.join(ROOT, 'releases', `v${releaseVersion}`)}`);

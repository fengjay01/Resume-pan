# Resume-Pan 桌面端（Electron）

本目录是桌面版独立副本：前端代码与 Web 版完全一致（`app/`），外加 Electron 壳（`electron/`）。
功能保持一致：编辑器、模板/主题、批量导入导出（矢量/图片版）、导入 1:1 还原、OCR、localStorage 本地存储等。

## 与 Web 版的唯一差异：导出渲染服务

Web 版矢量导出依赖 `tools/export-service.mjs`（驱动**系统 Chrome** 走 CDP `Page.printToPDF`）。
桌面端自带同款 Chromium 引擎，主进程改为 **隐藏 BrowserWindow + `webContents.printToPDF`**：

- 不再依赖用户装没装 Chrome；
- API 完全同款（`GET /ping`、`GET /job/<id>`、`POST /export`，含 PDF 元数据 /Keywords 注入），
  前端 `serverExport.ts`、批量导出、图片版栅格化零改动复用；
- UI 与服务同源托管（`app/dist` 静态 + SPA 回退），打印 HTML 的绝对资源地址无需改写；
- 端口优先复用上次记住的值（`data/service-port.txt`，保持 origin 稳定 = 数据不「消失」），
  否则从 8790 起顺延探测（避开 Web dev 服务）；实际端口经 preload 注入 `window.desktopServiceUrl`。

## 开发

```bash
# 两个终端：
npm run dev:vite   # 终端 1：vite dev（导出走 vite 插件拉起的渲染服务，与 Web dev 一致）
npm run dev        # 终端 2：electron . --dev（加载 127.0.0.1:5173）
```

## 构建 & 运行

```bash
npm run build      # = cd app && npm run build（tsc + vite build → app/dist）
npm start          # electron .（主进程起本地服务并托管 dist）
npm run smoke      # 无窗口冒烟模式，供自动化测试（curl /ping、POST /export）
```

## 打包 Release 资产（当前仅 Windows / 本地 electron-builder）

```bash
npm install          # desktop/ 下（已含 electron-builder、7zip-bin）
npm run pack:win     # Windows x64 + arm64：NSIS 安装包 + 绿色便携版
npm run release      # 只重新整理 .build-env/out/（改名 / 绿色版 / 校验和）
node tools/verify-release.mjs   # 产物自检：/ping、/export PDF、便携 data/、格式魔数
```

**Windows 直接用本地 Windows electron-builder 打包发布**，不依赖 CI：跑完
`npm run pack:win`，用 `gh release create`（走 GitHub API）把 `desktop/releases/<版本>/` 里的资产上传到
Release 即可。发布当时 `git push` 到 github.com 曾被本机代理拦成 502（稍后重试即通），
`api.github.com` / `uploads.github.com` 全程可用；**代码已提交并推送**，tag `0.1.0`
与 `main` 保持一致。当前版本 **0.1.0**（2026-11-12 已发布首个 Release）。

**Release 命名约定**：tag 与显示标题都用**纯版本号** `<版本>`（如 `0.1.0`），
不加产品名前缀；说明正文首行也写 `# <版本>`。以后每个版本照此办理：

```bash
cd desktop
gh release create 0.2.0 --repo fengjay01/Resume-pan --target main \
  --title "0.2.0" --notes-file .build-env/release-notes.md \
  releases/0.2.0/*.exe releases/0.2.0/*.blockmap releases/0.2.0/*.7z
```

`--target main` 让 tag 落在当前主分支；若要让 tag 指向某次特定提交，换成完整 SHA。
修改已发布 Release 的标题用 `gh release edit 0.1.0 --title "0.1.0"`，
移动 tag 用 `gh api -X PATCH .../git/refs/tags/0.1.0 -f sha=<SHA> -F force=true`
并同步 `PATCH .../releases/{id}` 的 `target_commitish`（资产不受影响）。

### 目录分层：所有产物 / 下载 / 缓存都在项目目录内，绝不写 C 盘

```
desktop/
├── app/                    前端源码 + app/node_modules（前端依赖）+ app/dist（前端产物）
├── electron/               主进程 / preload 源码
├── resources/              构建资源层：icon.ico / icon.png，用户自备素材放 icons/
├── tools/                  构建 / 整理 / 自检脚本
├── node_modules/           桌面端构建依赖层（electron / electron-builder / 7zip-bin）
├── data/                   开发版运行数据（含简历，已 gitignore）
├── .build-env/             【构建环境层】全部可删、已 gitignore
│   ├── cache/electron/     Electron 二进制 zip（electronDownload.cache）
│   ├── cache/builder/      NSIS / winCodeSign 工具（ELECTRON_BUILDER_CACHE）
│   ├── cache/npm/          npm / npx 缓存（npm_config_cache）
│   ├── tmp/                构建与运行期 TMP / TEMP
│   └── out/<arch>/         electron-builder 原始输出（x64/、arm64/ 各自独立）
└── releases/               【交付层】按版本归档（已 gitignore）
    └── 0.1.0/            该版本全部资产；以后每版一个 <版本>/ 目录
```

`tools/pack-release.mjs` 在构建子进程统一注入 `ELECTRON_BUILDER_CACHE`、
`ELECTRON_CACHE`、`electron_config_cache`、`npm_config_cache`、`TMP`/`TEMP`，
并用 CLI 把 `electronDownload.cache` / `directories.output` 覆盖成项目内绝对路径；
`.npmrc` 里的 `cache` / `tmp` 是手动执行 `npm install` 时的兜底。
`tools/verify-release.mjs` 运行 exe 时同样把临时目录指向项目内。
**运行时数据也不再写系统 AppData**：打包版一律 exe 同级 `data/`，旧系统目录只作只读迁移源。

**按版本归档（升级迭代）**：`tools/make-release.mjs` 按 `package.json` 的 `version` 把资产
写到 `desktop/releases/<版本>/`（当前 `0.1.0/`），`SHA256SUMS.txt` 与 `manifest.json`
也在该目录内。升级时改 `version` 再跑 `npm run pack:win` 即自动新建版本目录，旧版本
原样保留；`node tools/verify-release.mjs --version=0.1.0` 可自检任意历史版本。

### 最小化打包（已启用）

| 措施 | 效果 |
| --- | --- |
| 逐架构独立构建（`--win --x64` / `--win --arm64` 分开跑） | 不再产出 315MB 的 universal 双架构安装包 |
| `files` 白名单排除 511 个 `.woff`（16.8MB）+ `pruneDist()` 改写 CSS | CSS 720 个 `@font-face` 全部 woff2 优先，0 个只引用 woff；不删源文件、只挡在 asar 外，字形不回退 |
| `compression: maximum` + 绿色版 7z `-mx=9 -ms=on` | NSIS 内置 7z/LZMA 与固实归档用最高压缩级别 |
| `electronLanguages: [zh-CN, en-US]` | 清掉 Electron 自带的其余几十种 locale.pak |
| `files` 白名单 + 排除 `*.map` / `*.woff` | 源码、node_modules、sourcemap 不进 asar |

`tools/make-release.mjs` 规范命名、生成绿色 7z、输出 `SHA256SUMS.txt` 与 `manifest.json`：

| 平台 | 架构 | 资产 |
| --- | --- | --- |
| Windows | x64 / arm64 | `resume-pan-desktop-<版本>-<arch>-Setup.exe` + `.exe.blockmap`、`resume-pan-desktop-<版本>-win_<arch>-green.7z` |
| 元数据 | — | `builder-debug-<arch>.yml`、`SHA256SUMS.txt`、`manifest.json` |

未配置自动更新服务，因此不生成 `latest.yml`；需要时加 `publish` 配置即可。
文件锁避让时输出目录可能变成 `x64-2` / `arm64-2` 等，仍在 `.build-env/out/` 内。

绿色 7z 根目录带 `portable.txt`；**绿色版与 NSIS 安装版的数据都放 exe 同级 `data/`**，
整个安装目录可拷走，卸载 / 覆盖安装不会删简历。可用环境变量 `RESUME_PAN_DATA_DIR`
（绝对路径）覆盖数据位置。**打包版不会把数据写进只读的 `resources/app.asar`。**

## 代码签名

**决定：不签名（2026-11-12）。** 产物保持未签名，`electron-builder.yml` 里没有任何
sign / 证书配置，打包流程也不读取签名环境变量。

影响：用户首次运行安装包时 Windows 会显示「未知发布者」，SmartScreen 可能提示，
需要在发布说明里提醒用户「更多信息 → 仍要运行」。这是预期行为，不是打包错误。

将来若改主意：本机 electron-builder 26 用 `win.signtoolOptions`（v27 的 `win.sign`
不适用），或设 `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` 环境变量；证书走 OV，
别为 SmartScreen 特意买 EV（2024 起 EV 也不再即时放行）。私钥文件已被
`.gitignore` 的 `*.pfx` / `*.p12` 忽略。

### 平台与架构边界（为什么不是「全架构全平台」）

- 本项目锁定 **Electron 44.9.0**：官方自 44 起只发布 64 位二进制，**没有 win32-ia32**，
  electron-builder 会直接拒绝该架构；Windows 7/8/8.1 也不再支持（最低 Windows 10）。
  截图里 lx-music 的 `win_x86` / `win7_x64` 变体依赖旧版 Electron（22/43 系列），
  而本项目 pdfjs-dist 6.x 依赖 Chrome 140+ 的 `toHex`，不能降级。
- 因此 Windows 覆盖面为 **x64 + arm64**（64 位 Windows 10/11），已是 Electron 44 在
  Windows 上可用的全部架构。
- **Linux / macOS 暂不适配**（按当前发布范围）：macOS 的 dmg/签名/公证只能在 macOS 上完成；
  Linux 的 deb/AppImage/pacman 在 Windows 主机上受符号链接权限与元数据限制，需要 Linux runner。
  将来扩展时只需在 `electron-builder.yml` 加 `linux:` / `mac:` 段并在 CI 里启用对应 job。
- 产物为**未签名**（按 2026-11-12 决定不启用代码签名）：Windows SmartScreen 会提示
  「未知发布者」，在发布说明里提醒用户「更多信息 → 仍要运行」即可，不是打包错误。

### 后续计划：GitHub Actions 三端自动发布（当前不启用）

现阶段 Windows 就是本地 `electron-builder` 打包、手动上传 Release，仓库里**没有**自动发布
工作流。将来要做成 lx-music 那样发布者显示 `github-actions[bot]` 的云端发布时，再补：

- `windows-latest`：沿用 `npm run pack:win`（或由本地产物上传）；
- `ubuntu-latest`：Linux 的 deb / AppImage / pacman 必须在 Linux 上构建（Windows 上受
  symlink 权限与 metadata 限制），并补 `homepage` 等包元数据；
- `macos-latest`：dmg / 签名 / 公证只能在 macOS 上完成；
- 一个 `publish` job 汇总三端产物，用内置 `GITHUB_TOKEN` 创建 Release。

同时需要在 `electron-builder.yml` 里加回 `linux:` / `mac:` 配置段，并在
`tools/pack-release.mjs` 的 `groups` 里放开对应平台。

## 数据存储位置

- 开发版默认数据目录为应用内的 `data/`（即 `desktop/data/`）；**打包版（绿色 7z 与 NSIS
  安装版）一律 exe 同级 `data/`**，整个应用目录拷走就带走全部数据。
  该目录含个人信息，**已被仓库 `.gitignore` 忽略，切勿提交**；
- **不会主动写系统 AppData（C 盘）**：既不 `%APPDATA%` 里建目录，也不写迁移标记。
  旧版本数据（Windows 下 `%APPDATA%/resume-pan-desktop`）只作为**只读**迁移源，首次启动
  一次性复制 `Local Storage`、`Session Storage`、`service-port.txt` 等到 `data/`，
  迁移标记 `.migrated-from-*` 写在目标目录内（项目盘），避免重复回填；目标已有数据时绝不覆盖；
- 需要固定到别的位置时设置环境变量 `RESUME_PAN_DATA_DIR`（绝对路径），或在账号页指定；
- **端口必须一并迁移**：本地存储按 origin（`http://127.0.0.1:<port>`）隔离，端口变化会让
  LevelDB 里的简历读不到；
- 账号页「数据存储位置」可改成任意文件夹，配置写在 `data/data-folder.json`，重启后生效，
  可选一并迁移数据；
- 清除该目录等同于删除全部简历，重要数据请先在账号页导出 JSON 备份或导出 PDF。

## 桌面端行为说明

- 单实例锁：重复启动会唤起已有窗口；
- 下载（单份/批量导出）默认落到系统「下载」文件夹，无浏览器多文件下载拦截；
- 批量导出「选择文件夹」走 File System Access API，主进程已放行 `fileSystem` 权限；
- Ctrl+Shift+I 可开 DevTools。

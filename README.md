# Resume-Pan

简体中文 · [English](./README.en.md)

> 一份完全跑在你自己设备上的简历工具：编辑、排版、导出、导入，不上传任何数据。

Resume-Pan 是面向技术从业者的免费简历制作工具。纯前端实现，没有账号、没有后端、没有埋点，简历只保存在浏览器本地。项目同时提供 **Web 版** 与 **Electron 桌面版**，两者共用同一套编辑器、渲染引擎和导入导出链路。当前版本 **0.1.0**。

桌面版已发布 Windows 安装包，见 [GitHub Releases](https://github.com/fengjay01/Resume-pan/releases/tag/v0.1.0)（x64 / arm64 安装版与绿色便携版，仅 Windows 10/11 64 位）。

## 核心能力

- **模块化编辑**：基本信息、教育经历、专业技能、工作经历、项目经历、自定义模块；富文本支持加粗、列表、缩进
- **所见即所得**：编辑区与纸张共用同一套字体、字号、行高和内容宽度；两趟渲染（离屏量测 → 贪心分页）保证预览与导出一致
- **排版控制**：6 种章节标题版式 × 8 个预设主题色，支持自定义取色；字号与五项间距可 0.5px 微调
- **导出 PDF**：矢量版（文字可选中、可搜索，走浏览器打印通道）与图片版（兼容模式），无水印；支持多选简历批量导出，可直写指定文件夹
- **导入简历**：PDF（文字版直接解析 / 扫描件中文 OCR）、Word `.docx`、纯文本，自动识别模块与联系方式；上传框支持多选，逐份批量导入
- **无损往返**：本产品导出的 PDF 在元数据 `/Keywords` 中内嵌压缩的简历数据，再次导入可 1:1 还原（含排版格式），不污染可复制文本
- **简历管理**：置顶（不限量）、拖拽排序、按名称 / 修改时间排序、回收站（保留 30 天）
- **离线可用**：内置 Inter、Noto Sans SC、Noto Serif SC、霞鹜文楷、MiSans 等 Web Font；PDF.js 的 cMap / wasm 与 Tesseract 中文模型均随仓库本地打包，按需动态加载

## 技术栈

| 层面 | 选型 |
| --- | --- |
| 框架 | Vite 5 · React 18 · TypeScript 5 · Tailwind CSS 3 |
| 状态 | zustand 4（`persist` 到 localStorage） |
| PDF | PDF.js 6（解析）· jsPDF + html2canvas（图片版导出）· 浏览器 `printToPDF`（矢量导出） |
| OCR | Tesseract.js 7 + 简体中文模型（仅扫描件） |
| 桌面端 | Electron 44（Chromium 152），隐藏 BrowserWindow + `webContents.printToPDF` |
| 打包 | electron-builder 26（仅 Windows，本地构建），产物输出到 `desktop/releases/v<版本>/` |

## 目录结构

```
.
├── app/                       Web 版前端
│   ├── src/
│   │   ├── pages/             页面（首页 / 模板 / 我的简历 / 回收站 / 编辑器 …）
│   │   ├── components/        editor 编辑器、resume 渲染引擎、site 站点、common 通用组件
│   │   ├── lib/               分页量测、导入解析、导出、字体、持久化
│   │   ├── store/             zustand 状态（简历、回收站、编辑器标签页）
│   │   └── types/
│   └── public/                静态资源（Web Font、PDF.js、Tesseract）
├── desktop/                   Electron 桌面版（独立副本，不依赖 Web 版目录）
│   ├── app/                   前端副本，仅导出服务地址读取方式有差异
│   ├── electron/              主进程：静态托管 + 本地导出服务
│   ├── resources/             构建资源（icon.ico / icon.png / icons/）
│   ├── tools/                 打包、整理、自检与调试脚本
│   │   ├── pack-release.mjs    一键 Windows Release 打包
│   │   ├── make-release.mjs    资产改名 / 绿色 7z / SHA256 清单
│   │   └── verify-release.mjs  产物自检（/ping、/export PDF、便携数据目录）
│   ├── .build-env/            构建环境层（运行时生成，已忽略）
│   │   ├── cache/electron/     Electron 二进制 zip
│   │   ├── cache/builder/      NSIS / winCodeSign 工具
│   │   ├── cache/npm/          npm / npx 缓存
│   │   ├── tmp/                构建期 TMP / TEMP
│   │   └── out/<arch>/         electron-builder 原始输出
│   ├── releases/              交付层：按版本归档（已忽略）
│   │   └── v0.1.0/            该版本全部资产；以后每版一个 v<版本>/ 目录
│   ├── data/                  开发版运行数据（简历 / 回收站 / 偏好 / 端口记忆，已忽略）
│   ├── electron-builder.yml   打包配置（仅 Windows）
│   └── README-DESKTOP.md      桌面版详细说明
├── tools/                     开发与测试脚本（不参与构建）
│   ├── tests/ seeds/ fixtures/   逻辑回归、测试简历数据、测试夹具
│   ├── export-service.mjs    矢量导出的无头 Chrome 渲染服务（端口 8790）
│   ├── shot.mjs              浏览器冒烟 / 截图
│   ├── roundtrip.mjs         导出 → 导入 往返一致性
│   └── batch-*-check.mjs     批量导出 / 批量导入端到端测试
├── docs/使用手册.md
└── LICENSE*                  双协议文本
```

## 快速开始（Web 版）

需要 Node.js 18+ 与 npm。

```bash
git clone https://github.com/fengjay01/Resume-pan.git
cd Resume-pan/app
npm install
npm run dev          # http://127.0.0.1:5173
```

```bash
npm test             # 逻辑回归：渲染 / 新条目 / 导入解析
npm run typecheck    # TypeScript 检查
npm run build        # 产物输出到 app/dist
npm run preview      # 预览生产构建：http://127.0.0.1:4173
```

开发模式下，Vite 插件会自动拉起 `tools/export-service.mjs`（默认端口 8790）用于矢量 PDF 导出，需要本机安装 Chrome / Edge；服务不可用时自动回退到浏览器打印对话框。

浏览器端到端测试（先启动 `npm run dev`）：

```bash
node tools/shot.mjs --url=http://127.0.0.1:5173/resumes --seed=tools/seeds/seed-multi.json --out=shot.png
node tools/roundtrip.mjs                    # 导出 → 导入 1:1 还原
node tools/batch-export-check.mjs --mode=vector
node tools/batch-import-check.mjs
```

## 下载与安装（Windows 桌面版）

从 [Releases](https://github.com/fengjay01/Resume-pan/releases/tag/v0.1.0) 下载 `v0.1.0`：

| 文件 | 适用 |
| --- | --- |
| `resume-pan-desktop-v0.1.0-x64-Setup.exe` | 64 位 Intel / AMD，Windows 10 / 11 |
| `resume-pan-desktop-v0.1.0-arm64-Setup.exe` | ARM64 Windows 设备 |
| `resume-pan-desktop-v0.1.0-win_<arch>-green.7z` | 绿色便携版，解压即用 |

- 安装版双击 Setup.exe 可自选目录；绿色版解压后运行 `Resume-Pan.exe`。
- 两种形态的简历数据都放在 **exe 同级 `data/`**，整个应用目录拷走即带走全部数据，卸载 / 覆盖安装不会删除简历。
- **产物未签名**：首次运行 SmartScreen 可能显示「未知发布者」，点「更多信息 → 仍要运行」即可，这是预期行为。
- 当前仅发布 Windows x64 / arm64；macOS / Linux 暂不适配（Electron 44 只发 64 位二进制，macOS 签名公证需 macOS，Linux 包需 Linux runner）。

## 桌面端开发（Electron）

桌面版自带 Chromium，导出不再依赖系统安装的 Chrome。

```bash
cd desktop
npm install                 # Electron + electron-builder + 7zip-bin
npm --prefix app install    # 前端依赖
npm run build               # tsc + vite build → desktop/app/dist
npm start                   # 启动应用（本地服务从 8790 起顺延探测）
npm run smoke               # 无窗口冒烟（/ping、/export）
npm run pack:win            # 构建 Windows x64 / arm64 Release → desktop/releases/v<版本>/
node tools/verify-release.mjs --out=.build-env/out   # 产物自检
```

开发模式需要两个终端：`npm run dev:vite` 与 `npm run dev`。

**目录分层与零 C 盘写入**：打包时所有下载、缓存、临时文件与原始输出都落在 `desktop/.build-env/`（Electron 二进制、NSIS 工具、npm 缓存、TMP/TEMP、逐架构输出），最终资产只进 `desktop/releases/v<版本>/`。`tools/pack-release.mjs` 用环境变量和 CLI 覆盖把这些路径锁在项目内，`.npmrc` 与 `.gitignore` 兜底；实测构建前后 C 盘各缓存目录大小零变化。

**按版本归档 / 升级迭代**：最终资产统一放 `desktop/releases/v<版本>/`，如当前的 `v0.1.0/`。
升级时改 `package.json` 的 `version` 再跑 `npm run pack:win`，会自动新建对应版本目录，
旧版本目录原样保留；`node tools/verify-release.mjs --version=0.1.0` 可自检任意历史版本。

**数据目录**：开发版在 `desktop/data/`；打包版（安装版与绿色版）一律 exe 同级 `data/`，都不写 C 盘系统目录。旧系统目录（Windows 下 `%APPDATA%/resume-pan-desktop`）只作**只读**迁移源，迁移标记写在目标目录；迁移会带上 `service-port.txt`——本地存储按 origin 隔离，端口一变简历就会「读不到」。该目录含个人信息，已加入 `.gitignore`，切勿提交；可用环境变量 `RESUME_PAN_DATA_DIR` 或在账号页「数据存储位置」更改。

更多细节（单实例锁、下载目录、DevTools、打包参数与体积优化）见 [desktop/README-DESKTOP.md](./desktop/README-DESKTOP.md)。

## 数据与隐私

- 简历存于浏览器 `localStorage`（key `xl-resume-data`），只保存简历列表与回收站；桌面版开发态持久化在 `desktop/data/`，打包版在 exe 同级 `data/`，均不写 C 盘系统目录（可在账号页更改位置）。该目录含个人信息且已被 `.gitignore` 忽略
- 本地存储按来源（origin）隔离：`127.0.0.1:5173`（Web dev）、`:4173`（生产预览）、`:8790` 起（桌面端，实际端口记在 `service-port.txt`）是三份互不相通的数据，切换启动方式后看不到之前的简历属正常现象
- 清除浏览器数据、更换浏览器或使用无痕模式都会导致简历丢失；账号页可导出 JSON 备份，导出的 PDF 内嵌数据也可 1:1 导入还原
- 应用不向任何服务器发送简历内容；字体、PDF.js、OCR 模型全部为本地静态资源
- 删除为软删除，回收站条目保留 30 天后自动清理

## 已知限制

- 矢量导出依赖本机 Chrome（Web 版）或内置 Chromium（桌面版）；不同机器的字体与打印引擎差异可能造成 ±1px 级排版偏差
- OCR 仅内置简体中文模型
- 桌面端当前只发布 Windows x64 / arm64 安装包，macOS / Linux 暂不适配；产物未签名，SmartScreen 会提示「未知发布者」
- 不提供云同步与多设备同步

## 许可证

本项目采用 **双许可**，你可任选其一使用、修改和分发：

- [MIT License](./LICENSE-MIT)
- [Apache License 2.0](./LICENSE-APACHE)

`SPDX-License-Identifier: MIT OR Apache-2.0`，完整说明见 [LICENSE](./LICENSE)。第三方依赖各自遵循其原有许可证，见 `app/package.json` 与 `desktop/package.json`。

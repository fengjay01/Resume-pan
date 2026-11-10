# Resume-Pan

简体中文 · [English](./README.en.md)

> 一份完全跑在你自己设备上的简历工具：编辑、排版、导出、导入，不上传任何数据。

Resume-Pan 是面向技术从业者的免费简历制作工具。纯前端实现，没有账号、没有后端、没有埋点，简历只保存在浏览器本地。项目同时提供 **Web 版** 与 **Electron 桌面版**，两者共用同一套编辑器、渲染引擎和导入导出链路。

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
│   ├── data/                  运行数据（简历 / 回收站 / 偏好 / 端口记忆，运行时生成，已忽略）
│   ├── tools/                 桌面端自测脚本
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

## 桌面端（Electron）

桌面版自带 Chromium，导出不再依赖系统安装的 Chrome。

```bash
cd desktop
npm install                 # 安装 Electron
npm --prefix app install    # 安装前端依赖
npm run build               # tsc + vite build → desktop/app/dist
npm start                   # 启动应用（自动开窗口，本地服务默认 8791）
npm run smoke               # 无窗口冒烟（/ping、/export）
```

开发模式需要两个终端：`npm run dev:vite` 与 `npm run dev`。

**数据目录**：默认落在应用内的 `desktop/data/` 便携目录，整个 `desktop/` 拷走即带走数据，不写入 C 盘系统目录。首次以新版启动时，会自动把旧系统目录（Windows 下为 `%APPDATA%/resume-pan-desktop`）里的数据迁移过来，并**保留原来的服务端口**——本地存储按 origin 隔离，端口一变简历就会「读不到」。该目录含个人信息，已加入 `.gitignore`，切勿提交；位置可在账号页「数据存储位置」更改。

更多细节（单实例锁、下载目录、DevTools）见 [desktop/README-DESKTOP.md](./desktop/README-DESKTOP.md)。

## 数据与隐私

- 简历存于浏览器 `localStorage`（key `xl-resume-data`），只保存简历列表与回收站；桌面版默认持久化在应用内的 `desktop/data/` 便携目录（不写入 C 盘系统目录，可在账号页更改位置），该目录含个人信息且已被 `.gitignore` 忽略
- 本地存储按来源（origin）隔离：`127.0.0.1:5173`（Web dev）、`:4173`（生产预览）、`:8791`（桌面端）是三份互不相通的数据，切换启动方式后看不到之前的简历属正常现象
- 清除浏览器数据、更换浏览器或使用无痕模式都会导致简历丢失；账号页可导出 JSON 备份，导出的 PDF 内嵌数据也可 1:1 导入还原
- 应用不向任何服务器发送简历内容；字体、PDF.js、OCR 模型全部为本地静态资源
- 删除为软删除，回收站条目保留 30 天后自动清理

## 已知限制

- 矢量导出依赖本机 Chrome（Web 版）或内置 Chromium（桌面版）；不同机器的字体与打印引擎差异可能造成 ±1px 级排版偏差
- OCR 仅内置简体中文模型
- 桌面版尚未提供安装包（未配置 electron-builder）
- 不提供云同步与多设备同步

## 许可证

本项目采用 **双许可**，你可任选其一使用、修改和分发：

- [MIT License](./LICENSE-MIT)
- [Apache License 2.0](./LICENSE-APACHE)

`SPDX-License-Identifier: MIT OR Apache-2.0`，完整说明见 [LICENSE](./LICENSE)。第三方依赖各自遵循其原有许可证，见 `app/package.json` 与 `desktop/package.json`。

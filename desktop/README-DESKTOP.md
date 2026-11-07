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
- 端口从 8790 起顺延探测（避开 Web dev 服务），实际端口经 preload 注入 `window.desktopServiceUrl`。

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

## 打包安装包（可选）

```bash
npm i -D electron-builder
npx electron-builder --win nsis   # 需自行补 build 配置（appId、files: electron/ + app/dist）
```

## 桌面端行为说明

- 数据仍存 localStorage（来源 `http://127.0.0.1:<port>`），随用户数据目录（userData）持久化；
- 单实例锁：重复启动会唤起已有窗口；
- 下载（单份/批量导出）默认落到系统「下载」文件夹，无浏览器多文件下载拦截；
- 批量导出「选择文件夹」走 File System Access API，主进程已放行 `fileSystem` 权限；
- Ctrl+Shift+I 可开 DevTools。

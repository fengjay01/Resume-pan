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

## 打包安装包（可选）

```bash
npm i -D electron-builder
npx electron-builder --win nsis   # 需自行补 build 配置（appId、files: electron/ + app/dist）
```

## 数据存储位置

- 默认数据目录为应用内的 `data/`（即 `desktop/data/`），整个 `desktop/` 拷走就带走全部数据，
  不占用 C 盘系统 userData；该目录含个人信息，**已被仓库 `.gitignore` 忽略，切勿提交**；
- 旧版本数据放在系统 userData（Windows 下为 `%APPDATA%/resume-pan-desktop`）。首次以新版启动会
  一次性迁移 `Local Storage`、`Session Storage`、`service-port.txt` 等核心数据到 `data/`，
  并在旧目录留下 `.migrated-to-portable` 标记，避免重复回填；目标已有数据时绝不覆盖；
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

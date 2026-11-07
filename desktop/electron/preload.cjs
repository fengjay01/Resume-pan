/**
 * 桌面端 preload：
 *  - desktopServiceUrl：主进程实际启动的渲染服务地址（端口可能从 8790 顺延），
 *    app/src/lib/serverExport.ts 优先读取，没有则回退 Web 版默认 8790（dev 模式即此情形）；
 *  - desktopSettings：桌面端设置 API（数据存储文件夹等，走 IPC 到主进程）。
 */
const { contextBridge, ipcRenderer } = require('electron');

const portArg = process.argv.find((a) => a.startsWith('--service-port='));
if (portArg) {
  const port = portArg.split('=')[1];
  contextBridge.exposeInMainWorld('desktopServiceUrl', `http://127.0.0.1:${port}`);
}

contextBridge.exposeInMainWorld('desktopSettings', {
  getDataFolderInfo: () => ipcRenderer.invoke('data-folder:info'),
  chooseDataFolder: () => ipcRenderer.invoke('data-folder:choose'),
  applyDataFolder: (payload) => ipcRenderer.invoke('data-folder:apply', payload),
  openDataFolder: () => ipcRenderer.invoke('data-folder:open'),
});

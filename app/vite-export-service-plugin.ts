/**
 * dev 模式自动拉起「本地渲染服务」（tools/export-service.mjs）。
 *
 * 背景：导出菜单的「浏览器导出」优先走本地渲染服务（无头 Chrome printToPDF，
 * 一键下载的无损矢量 PDF）；服务没起时会回退打印对话框（要用户手动另存为 PDF）。
 * 之前用户机器上服务没运行，一键导出实际一直走兜底路径——体验割裂。
 * 在 dev server 里把它常驻拉起，`npm run dev` 之后两种导出就都就绪。
 *
 * 退出：XL_EXPORT_SERVICE=0 关闭本插件。
 * 端口：8790 已被占用（比如用户自己手动起了服务）时探测到就跳过，不重复拉起。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const SERVICE_PORT = 8790;

export function exportServicePlugin(): Plugin {
  let child: ChildProcess | null = null;

  return {
    name: 'resume-export-service',
    apply: 'serve', // 只在 dev server 生效，不进生产构建
    async configureServer(server) {
      if (process.env.XL_EXPORT_SERVICE === '0') {
        server.config.logger.info('[export-service] 已按 XL_EXPORT_SERVICE=0 跳过自动拉起');
        return;
      }
      const logger = server.config.logger;
      const appPort = Number(server.config.server.port) || 5173;

      // 已在运行（手动起的 / 上一个 dev 实例的残留）→ 不重复拉
      try {
        const res = await fetch(`http://127.0.0.1:${SERVICE_PORT}/ping`, {
          signal: AbortSignal.timeout(500),
        });
        if (res.ok) {
          logger.info(`[export-service] 已在运行（127.0.0.1:${SERVICE_PORT}），跳过自动拉起`);
          return;
        }
      } catch {
        /* 没起 → 继续 */
      }

      const script = fileURLToPath(new URL('../tools/export-service.mjs', import.meta.url));
      child = spawn(process.execPath, [script, `--port=${SERVICE_PORT}`, `--app=http://127.0.0.1:${appPort}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pipe = (stream: NodeJS.ReadableStream | null) => {
        stream?.on('data', (d: Buffer) => {
          for (const line of String(d).split('\n')) {
            const t = line.trim();
            if (!t) continue;
            // 服务自己的日志已带 [export-service] 前缀，别重复加（出现过
            // 「[export-service] [export-service] http://...」双前缀）
            logger.info(t.startsWith('[export-service]') ? t : `[export-service] ${t}`);
          }
        });
      };
      pipe(child.stdout);
      pipe(child.stderr);
      child.on('error', (err) => {
        logger.warn(`[export-service] 拉起失败（导出会回退打印对话框）：${String(err)}`);
      });
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          logger.warn(`[export-service] 进程退出 code=${code}（端口被占用时会这样，导出回退打印对话框）`);
        }
      });

      // dev server 关闭时一起收尸，别留孤儿进程
      const kill = () => {
        if (child && child.exitCode === null) {
          try {
            child.kill();
          } catch {
            /* ignore */
          }
        }
      };
      server.httpServer?.once('close', kill);
      process.once('exit', kill);
      logger.info(`[export-service] 已自动拉起（127.0.0.1:${SERVICE_PORT}，反代 127.0.0.1:${appPort}）`);
    },
  };
}

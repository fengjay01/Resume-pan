/**
 * 「本地渲染服务」导出：与预览 100% 一致的矢量 PDF，一键下载、不弹打印框。
 *
 * 原理与限制：浏览器里只有一套排版引擎，前端自绘 PDF 再像也到不了 100%
 * （自绘方案已于 2026-10 下线）。小林简历的做法是把数据 POST 给服务端，由
 * **无头 Chrome** 排版出 PDF 回传——服务端有完整的浏览器渲染引擎，所以才能
 * 「无损、放大不失真」。本项目提供零依赖的本地版同款服务
 * （tools/export-service.mjs，驱动系统 Chrome 的 Page.printToPDF）。
 * 本模块负责探测服务是否可用；可用则把 buildPrintDocument 产出的独立 HTML
 * POST 过去，拿到 PDF 直接下载；不可用则由调用方回退到浏览器内导出。
 */
import { buildPrintDocument, saveBlob } from './export';
import { encodeResumePayload } from './resumeEmbed';

/** 桌面端主进程注入的实际服务地址（端口可能从 8790 顺延）；Web 版走默认值 */
const DESKTOP_SERVICE_URL = (window as unknown as { desktopServiceUrl?: string }).desktopServiceUrl;

export const SERVICE_URL = DESKTOP_SERVICE_URL || 'http://127.0.0.1:8790';

/** 本地渲染服务是否在运行（500ms 超时，不阻塞 UI） */
export async function probeService(timeoutMs = 600): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${SERVICE_URL}/ping`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export interface ServicePdfRequest {
  root: HTMLElement;
  filename: string;
  /** 嵌入完整简历数据（写入 PDF 元数据 /Keywords，导入时 1:1 还原） */
  payload?: string;
  /** 请求超时 */
  timeoutMs?: number;
}

/**
 * 请求渲染服务出图，返回 PDF 字节（不触发下载）。
 * 图片版导出复用它：拿到矢量字节后再栅格化。
 */
export async function requestServicePdf(options: ServicePdfRequest): Promise<Uint8Array> {
  const { root, filename, payload, timeoutMs = 30000 } = options;
  const html = buildPrintDocument(root, filename || '简历');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${SERVICE_URL}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, filename, payload }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new Error('本地渲染服务未启动');
  }
  clearTimeout(timer);
  if (!res.ok) {
    let msg = `本地渲染服务返回 ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export interface LocalExportOptions {
  root: HTMLElement;
  filename: string;
  /** 嵌入完整简历数据（导入时可 1:1 还原），与打印版一致 */
  embed?: { resume: unknown };
  /** 探测/请求超时 */
  timeoutMs?: number;
}

/**
 * 「浏览器导出」的**产出物**：本地渲染服务的矢量 PDF Blob（不触发下载）。
 * 批量导出直写用户文件夹时走这条；单份导出用 exportViaService。
 */
export async function requestServicePdfBlob(options: LocalExportOptions): Promise<Blob> {
  const { root, filename, embed, timeoutMs = 30000 } = options;
  // 嵌入数据走 **PDF 元数据**（服务端渲染后注入），不进页面文本 ——
  // 复制 PDF 文字时不会再带出 base64 垃圾（旧方案是页面底部的白色小字）
  const payload = embed?.resume ? await encodeResumePayload(embed.resume as never) : undefined;
  const bytes = await requestServicePdf({ root, filename, payload, timeoutMs });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** 走本地渲染服务导出；服务不可用时抛错（由调用方回退） */
export async function exportViaService(options: LocalExportOptions): Promise<void> {
  const blob = await requestServicePdfBlob(options);
  saveBlob(blob, `${options.filename || '我的简历'}.pdf`);
}

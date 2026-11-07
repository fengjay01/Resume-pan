/**
 * PDF.js 的按需加载入口。
 *
 * 单独放在一个模块里有两个目的：
 * 1. `pdfjs-dist` 体积不小，用动态 import 让它成为一个独立 chunk，不进首屏包；
 * 2. worker 只配置一次（多个调用方共用同一个 Promise），避免重复设置 workerSrc。
 */
type Pdfjs = typeof import('pdfjs-dist');

let loading: Promise<Pdfjs> | null = null;

/** 拿到（已配置好 worker 的）PDF.js 模块 */
export function getPdfjs(): Promise<Pdfjs> {
  if (!loading) {
    loading = (async () => {
      const pdfjs = await import('pdfjs-dist');
      // worker 由 Vite 打包成独立资源（dev / build 都可用）
      const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })().catch((err) => {
      loading = null; // 失败后允许重试
      throw err;
    });
  }
  return loading;
}

export interface OpenedPdf {
  doc: import('pdfjs-dist').PDFDocumentProxy;
  /** 释放文档与 worker 资源 */
  destroy: () => Promise<void>;
}

/**
 * PDF.js 的附属资源目录（随 `public/pdfjs/` 一起发布）：
 * - `cmaps/`：中日韩等**预定义编码表**。中文 PDF 大量使用 `UniGB-UCS2-H` /
 *   `UniGB-UTF16-H` 这类编码，没有这些表 PDF.js 只能拿到空的字符 ——
 *   **不配 `cMapUrl` 的话中文 PDF 会一个字都提不出来**；
 * - `standard_fonts/`：标准 14 字体（字体没内嵌时的兜底，渲染成位图做 OCR 时需要）；
 * - `wasm/`：JPEG2000 / JBIG2 等图片解码器（图片型 PDF 常见）。
 *
 * 注意：`import.meta.env` 只在 Vite 环境存在，这里用可选链兜底，
 * 免得在 Node 里（比如测试脚本）导入本模块就炸。
 */
const viteBase = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
const ASSET_BASE = `${viteBase}pdfjs/`;

/**
 * 打开一份 PDF。
 *
 * `disableFontFace: true` —— 我们只用文本来提取文字 / 渲染成位图做 OCR，
 * 不需要浏览器字体，关掉能省不少开销，也避免个别字体导致的报错。
 */
export async function openPdf(buf: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    disableFontFace: true,
    verbosity: 0,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
  });
  const doc = await task.promise;
  return { doc, destroy: () => task.destroy() };
}

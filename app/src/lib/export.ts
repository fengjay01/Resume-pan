import { encodeResumePayload } from './resumeEmbed';
import { requestServicePdf } from './serverExport';

/**
 * 浏览器排版导出（打印文档组装 + 图片版栅格化）。
 *
 * 导出链路（自绘 PDF 方案已于 2026-10 下线，理由见文末）：
 *  ① 本地渲染服务：无头 Chrome `Page.printToPDF` 出矢量 PDF，一键下载；
 *  ② 打印对话框：window.print → 用户另存为 PDF，服务不可用时的兜底；
 *  ③ 图片版：把 ① 的矢量 PDF 栅格化装进 jsPDF，兼容老阅读器 / 投递系统。
 *
 * 三条链路共用 buildPrintDocument 这一个 HTML 几何源，差异只在「谁渲染」。
 * 让浏览器自己的引擎出图是唯一能「预览=导出」的路线——浏览器里只有一套排版引擎，
 * 前端自绘几何（pdf-lib 逐字符画）再贴近也到不了 100%，且系统字体读不出来、
 * CJK 子集化还会静默丢字形。小林简历等同类产品同样走「无头 Chrome 排版回传」。
 *
 * 简历数据不进页面文本层：早期方案把 base64 数据以白色 1px 不可见文字塞进每页，
 * 用户复制/提取 PDF 文本时会带出一大段乱码（「有很多字母出现」）。现在数据只写
 * PDF 元数据（/Keywords），导入时优先读元数据；打印对话框路径没有元数据通道，
 * 由导入端的文本结构解析兜底（1:1 还原能力不变差：文本解析一直兜底存在）。
 */

/** 收集页面全部样式。生产构建是 <link> 相对地址，弹窗的 base 是 about:blank 会加载失败，需转绝对地址 */
function collectStyles(): string {
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => {
      if (el.tagName !== 'LINK') return el.outerHTML;
      const link = el as HTMLLinkElement;
      const href = link.getAttribute('href') || '';
      if (!href) return '';
      try {
        return `<link rel="stylesheet" href="${new URL(href, document.baseURI).href}">`;
      } catch {
        return '';
      }
    })
    .join('\n');
}

/** 简单 HTML 转义（文件名/标题会插入 <title>） */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** 页面像素尺寸（与 A4 精确对应：794×1123 CSS px = 210×297mm @96dpi） */
const PAGE_CSS_W = 794;
const PAGE_CSS_H = 1123;

/**
 * 把打印副本里的 emoji 字宽钉死为屏幕实测值。
 *
 * 背景：打印管线里 emoji 的回退字体与屏幕可能不同（实测同一份 🔹，
 * 屏幕走彩色 emoji 字体、打印可能回退成单色 Segoe UI Symbol），
 * 字宽一变，靠 &nbsp; 手工对齐的版式（用户获奖区就是这种）换行点全偏。
 * 做法：① 同步遍历原树与克隆树的文本节点（克隆结构一致，节点一一对应）；
 * ② 用 Range 量出 emoji 在屏幕上的**实际渲染宽度**；③ 在克隆里把它包进
 * `inline-block + 固定宽 + 居中 + 强制彩色 emoji 字体` 的 span ——
 * 宽度不随打印管线变化，换行点与屏幕一致，颜色也一致。
 */
const EMOJI_PIN_RE = /[🔹🔸🔷🔶]/;

function pinEmojiAdvances(root: HTMLElement, clone: HTMLElement): void {
  const needsPin = (s: string | null) => !!s && EMOJI_PIN_RE.test(s);
  const w1 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const w2 = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let orig = w1.nextNode() as Text | null;
  let cloned = w2.nextNode() as Text | null;
  while (orig && cloned) {
    if (needsPin(orig.nodeValue)) {
      const text = orig.nodeValue || '';
      // 屏幕实测：每个 emoji 字符的渲染宽度
      const widths: Array<{ ch: string; w: number }> = [];
      for (const ch of text) {
        if (!EMOJI_PIN_RE.test(ch)) continue;
        const range = document.createRange();
        const off = orig.nodeValue!.indexOf(ch);
        range.setStart(orig, off);
        range.setEnd(orig, off + ch.length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) widths.push({ ch, w: rect.width });
      }
      // 在克隆节点里做替换（逐码点扫描，emoji 处换 span）
      if (widths.length) {
        const frag = document.createDocumentFragment();
        let buf = '';
        let wi = 0;
        for (const ch of text) {
          if (EMOJI_PIN_RE.test(ch)) {
                if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
            const span = document.createElement('span');
            span.style.display = 'inline-block';
            span.style.width = `${(widths[wi] ? widths[wi].w : parseFloat(getComputedStyle(orig.parentElement || document.body).fontSize) * 1.17).toFixed(2)}px`;
            span.style.textAlign = 'center';
            span.style.fontFamily = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
            span.textContent = ch;
            wi += 1;
            frag.appendChild(span);
          } else {
            buf += ch;
          }
        }
        if (buf) frag.appendChild(document.createTextNode(buf));
        cloned.parentNode?.replaceChild(frag, cloned);
      }
    }
    orig = w1.nextNode() as Text | null;
    cloned = w2.nextNode() as Text | null;
  }
}

export function buildPrintDocument(root: HTMLElement, title = '简历'): string {
  const clone = root.cloneNode(true) as HTMLElement;
  // 摘掉离屏量测容器（0×0 + visibility:hidden，打印无害但不干净，还会重复触发字体加载）
  clone
    .querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')
    .forEach((n) => n.remove());

  // 先把 emoji 的字宽「钉死」成屏幕实测值（见 pinEmojiAdvances），
  // 否则打印管线里 emoji 的回退字体宽度不同 → 手排 &nbsp; 布局的换行点全偏
  pinEmojiAdvances(root, clone);
  const body = clone.innerHTML;

  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    /* dev 模式的 <style> 里有 /node_modules/... 形式的根相对资源引用（字体文件），
       必须先声明 base 才能在弹窗里解析到 */
    `<base href="${document.baseURI}">`,
    '<title>',
    escapeHtml(title),
    '</title>',
    collectStyles(),
    '<style>',
    `@page { size: ${PAGE_CSS_W}px ${PAGE_CSS_H}px; margin: 0; }`,
    `html, body { width: ${PAGE_CSS_W}px; margin: 0; padding: 0; background: #fff; }`,
    /* 打印管线的文字度量与屏幕不同（整数化字距），每行会窄 ~2%，换行点变了分页就错位。
       geometricPrecision 强制用与屏幕一致的小数字距排版 */
    '* { text-rendering: geometricPrecision !important; }',
    /* 色块/背景色在打印里默认会被浏览器省略，必须逐元素显式保留 */
    '*, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
    '.resume-page { page-break-after: always; break-after: page; margin: 0; box-shadow: none !important; }',
    /* 打印排版与屏幕排版的度量有细微差别（行高取整/字距），不锁死高度的话
       每页会多容纳几行，分页点就和预览对不上了 */
    '.resume-page { height: 1123px !important; overflow: hidden !important; }',
    '.resume-page:last-child { page-break-after: auto; break-after: auto; }',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('\n');
}

/** 给任意 Promise 加超时上限（某个资源挂了也不能让打印永远等下去） */
function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    p,
    new Promise<void>((r) => setTimeout(r, ms)),
  ]);
}

/**
 * 等待弹窗内的样式 / 字体 / 图片全部就绪。
 * 打印触发早了会出现缺字（@font-face 还没下载完）或缺头像，这些资源在弹窗里是**新加载**的。
 */
async function waitPrintReady(win: Window): Promise<void> {
  await withTimeout(
    (async () => {
      const doc = win.document;

      // ① 样式表（生产是 <link>；dev 的 <style> 天然就绪）
      await Promise.all(
        Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(
          (link) =>
            new Promise<void>((resolve) => {
              if ((link as HTMLLinkElement).sheet) {
                resolve();
                return;
              }
              link.addEventListener('load', () => resolve(), { once: true });
              link.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );

      // ② 字体（@fontsource / lxgw 都是 CSS @font-face，首帧排版触发下载）
      const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
      try {
        await fonts?.ready;
      } catch {
        /* 字体加载失败不阻断打印 */
      }

      // ③ 图片（头像等）
      await Promise.all(
        Array.from(doc.images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );

      // ④ 图片就绪可能又触发新的字体下载（该字体首次被使用），再等一轮 + 一帧稳定
      try {
        await fonts?.ready;
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 250));
    })(),
    8000,
  );
}

/**
 * 打印对话框导出：打开打印窗口，用户在其中选「另存为 PDF」。
 *
 * 本地渲染服务不可用时的兜底通道。浏览器打印引擎与预览同一套排版，
 * 输出矢量、文字可选中；需要用户手动把边距设为「无」并勾选「背景图形」。
 * title 会成为「另存为 PDF」时建议的文件名。
 */
export async function printResume(root: HTMLElement, title = '简历'): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('浏览器阻止了打印窗口，请允许弹窗后重试');
  }
  win.document.open();
  win.document.write(buildPrintDocument(root, title));
  win.document.close();

  // 等字体与图片就绪再打印，避免缺字 / 缺头像
  await waitPrintReady(win);

  try {
    win.focus();
    win.print(); // Chrome 里会阻塞到用户关闭打印预览
  } finally {
    // 打印完成或取消后关闭临时窗口
    setTimeout(() => {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    }, 600);
  }
}

/* ------------------------------ 图片版导出（兼容模式） ------------------------------ */

/** 栅格化倍率：3 倍（≈288dpi）后缩到 A4 展示，文字锐利且文件体积可控 */
const RASTER_SCALE = 3;

/** 把 Blob 触发为浏览器下载（批量导出时逐份调用） */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 图片版导出（兼容模式）的**产出物**：浏览器排版引擎的矢量 PDF → 栅格化 → 图片 PDF Blob。
 *
 * 几何来源是本地渲染服务的 printToPDF 产物（与预览同一套排版引擎、同一套字体），
 * 不是自绘几何——布局与「浏览器导出」必然一致，只是最终变成位图，
 * 兼容一些对矢量 PDF 支持不好的老阅读器 / 投递系统。
 *
 * 位图 PDF 没有文字对象，导入 1:1 还原靠写入 PDF 元数据（/Keywords）的完整简历
 * 数据完成；复制正文文本不会带出 base64（元数据不在文本层里）。
 *
 * 只返回 Blob 不触发下载：批量导出可选「直接写入用户选择的文件夹」，
 * 那条路不能走浏览器下载（拿不到文件句柄）。
 *
 * 渲染服务未启动时抛错（由调用方提示）——栅格化必须有个浏览器引擎出图。
 */
export async function renderImagePdfBlob(
  root: HTMLElement,
  filename: string,
  embed?: { resume: unknown },
): Promise<Blob> {
  const pages = root.querySelectorAll<HTMLElement>('.resume-page');
  if (!pages.length) {
    throw new Error('未找到可导出的简历页面');
  }

  const payload = embed?.resume
    ? await encodeResumePayload(embed.resume as Parameters<typeof encodeResumePayload>[0])
    : undefined;

  // ① 浏览器排版引擎的矢量 PDF（无头 Chrome printToPDF，含元数据注入）
  let vectorBytes: Uint8Array;
  try {
    vectorBytes = await requestServicePdf({
      root,
      filename: filename || '简历',
      payload,
    });
  } catch {
    throw new Error(
      '本地渲染服务未启动，图片导出不可用。请运行 node tools/export-service.mjs 后重试，或改用「浏览器导出」。',
    );
  }

  // ② pdf.js 逐页栅格化（内嵌字体就在 PDF 里，与预览同字形）
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const base = import.meta.env.BASE_URL || '/';
  const doc = await pdfjs.getDocument({
    data: vectorBytes.slice(), // pdf.js 会 transfer 掉传入的 buffer，先拷贝
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    verbosity: 0,
  }).promise;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: RASTER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    await page.render({ canvasContext: ctx, canvas, viewport: vp, background: '#ffffff' }).promise;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 1) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  // ③ 完整简历数据写进 PDF 元数据（/Keywords），复制正文文本不再带出 base64 垃圾；
  //    导入时优先读元数据（见 resumeImport.ts）
  if (payload) {
    pdf.setProperties({ keywords: payload });
  }

  return pdf.output('blob');
}

/** 图片版导出（兼容模式）：产出 Blob 并触发下载（单份导出的入口） */
export async function exportResumePdf(
  root: HTMLElement,
  filename: string,
  embed?: { resume: unknown },
): Promise<void> {
  const blob = await renderImagePdfBlob(root, filename, embed);
  saveBlob(blob, `${filename || '我的简历'}.pdf`);
}

/**
 * 图片型 PDF 的文字识别（OCR）。
 *
 * 很多简历 PDF 是「图片版」——整页其实是位图，里面没有文字对象
 * （用 html2canvas + jsPDF 导出的 PDF、扫描件、以及相当多的在线简历站都是这样）。
 * 这类 PDF 只能靠 OCR：把每页渲染成位图，再交给 Tesseract 识别。
 *
 * 资源全部放在 `public/tesseract/`（本地打包、离线可用）：
 * - `worker.min.js`：Tesseract 的 worker
 * - `core/*.wasm.js`：WASM 内核（内嵌 wasm，按浏览器 SIMD 能力自动选一个）
 * - `lang/chi_sim.traineddata.gz`：简体中文模型（best_int，兼顾体积与准确率）
 *
 * Tesseract 是**按需动态加载**的，只有真的遇到图片型 PDF 才会去下载这些资源。
 */
import type { Worker as TesseractWorker } from 'tesseract.js';
import { openPdf } from './pdfjs';

/** OCR 进度（progress 为 0~1 的总进度） */
export interface OcrProgress {
  progress: number;
  /** 面向用户的中文状态文案 */
  status: string;
}

const TESSERACT_BASE = '/tesseract';

/** Tesseract 的英文状态 → 中文文案 */
function translateStatus(status: string): string {
  if (/loading tesseract core/i.test(status)) return '加载识别引擎';
  if (/initializing tesseract/i.test(status)) return '初始化识别引擎';
  if (/loading language traineddata/i.test(status)) return '加载中文语言包';
  if (/initializing api/i.test(status)) return '初始化识别接口';
  if (/recognizing text/i.test(status)) return '识别文字中';
  return status || '处理中';
}

/* ------------------------------ 识别结果整理 ------------------------------ */

/** 中文（含 CJK 标点、全角符号）字符类的内容 */
const CJK_CHARS = '\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
/** 单个中文字（用于判定边界） */
const CJK_CHAR = new RegExp(`[${CJK_CHARS}]`);

/** Tesseract 给的最小结构：词 + 包围盒 */
interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrLine {
  words: OcrWord[];
}

/**
 * 把 Tesseract 的**词级识别结果**还原成带排版的文本。
 *
 * 直接用 `data.text` 有两个问题：① 中文之间被塞满空格；
 * ② 分栏信息（「2024.07-至今　某某科技　算法工程师」）彻底丢了，
 * 后面按「两个以上空格」拆条目就全废了。
 *
 * 所以这里拿词级包围盒自己量间隔：**分行沿用 Tesseract 的版面分析结果**
 * （它已经做了行/段落切分，比我们按 y 再聚一次准），只在行内按 x 排词、
 * 按间隙补空格 —— 明显的分栏补 3 个空格，中文之间不补，中英之间补 1 个。
 */
function lineToText(line: OcrLine): string {
  const words = [...line.words].sort((a, b) => a.x0 - b.x0);
  if (!words.length) return '';

  // 先量一遍相邻词的间隙与字高，用来定「什么算分栏」
  const gaps: number[] = [];
  const heights: number[] = [];
  for (let i = 1; i < words.length; i += 1) {
    gaps.push(Math.max(0, words[i].x0 - words[i - 1].x1));
    heights.push(Math.max(6, Math.min(words[i - 1].y1 - words[i - 1].y0, words[i].y1 - words[i].y0)));
  }
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const h = Math.max(6, median(heights) || median(words.map((w) => w.y1 - w.y0)) || 10);
  // 分栏阈值：至少 1.35 个字高；如果这一行有明显的「普通词距」基准，
  // 再要求间隙明显大于它（1.8 倍）—— 否则整句中文都会被拆出一堆宽间隔
  let colThresh = h * 1.35;
  if (gaps.length >= 3) colThresh = Math.max(colThresh, median(gaps) * 1.8);

  let out = '';
  let prev: OcrWord | null = null;
  words.forEach((w) => {
    const t = w.text.trim();
    if (!t) return;
    if (prev) {
      const gap = w.x0 - prev.x1;
      const cjkJoin = CJK_CHAR.test(prev.text.slice(-1)) && CJK_CHAR.test(t[0]);
      if (gap >= colThresh) out += '   '; // 明显的分栏
      else if (!cjkJoin) out += ' '; // 中英之间保留空格
    }
    out += t;
    prev = w;
  });
  return out.trim();
}

/**
 * OCR 结果清理（针对整段纯文本，兜底用）。
 *
 * Tesseract 会按自己的分词往中文里塞空格（「教 育 背 景」「机 器 人」），
 * 数字也常被拆开（「9 0 %」「2024. 07」）。中文本身不用空格分词，
 * 所以这里把「中文与中文之间的**单个**空格」去掉（3 个空格是分栏标记，保留），
 * 并把被拆散的数字拼回去；中文与英文之间的空格保留。
 */
function cleanOcrText(raw: string): string {
  let t = raw.replace(/\r\n?/g, '\n');
  const cjkSpace = new RegExp(`([${CJK_CHARS}])[ \\t\\u3000]([${CJK_CHARS}])`, 'g');
  for (let i = 0; i < 4; i += 1) {
    // 只吃单个空格：多个空格是「分栏」信息，要留着
    t = t.replace(cjkSpace, '$1$2');
  }
  t = t
    // 数字被拆开：9 0 % → 90%；2024. 07 → 2024.07
    .replace(/(\d)[ \t]+(?=\d)/g, '$1')
    .replace(/([.．])[ \t]+(?=\d)/g, '$1')
    .replace(/(\d)[ \t]+(?=[%‰])/g, '$1')
    // 冒号两侧的空格：求职意向 : 机器人 → 求职意向:机器人
    .replace(/[ \t]+([:：])/g, '$1')
    .replace(/([:：])[ \t]+/g, '$1')
    // 顿号/逗号前后的空格
    .replace(/[ \t]+([、，,。；;])/g, '$1');

  return t
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, '   ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 识别结果 → 文本（优先用词级坐标还原排版，取不到就退回纯文本清理） */
function ocrResultToText(data: { text?: string; blocks?: unknown[] | null }): string {
  // 沿用 Tesseract 的版面顺序（块 → 段 → 行），行内再按词的 x 排序
  const lines: string[] = [];
  (data.blocks || []).forEach((blockRaw) => {
    const block = blockRaw as {
      paragraphs?: {
        lines?: {
          words?: {
            text?: string;
            bbox?: { x0: number; y0: number; x1: number; y1: number };
          }[];
        }[];
      }[];
    };
    (block.paragraphs || []).forEach((p) => {
      (p.lines || []).forEach((l) => {
        const words: OcrWord[] = [];
        (l.words || []).forEach((w) => {
          const text = (w.text || '').trim();
          const b = w.bbox;
          if (!text || !b) return;
          words.push({ text, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
        });
        if (!words.length) return;
        const text = lineToText({ words });
        if (text) lines.push(text);
      });
    });
  });

  if (lines.length) return cleanOcrText(lines.join('\n'));
  return cleanOcrText(data.text || '');
}

/* --------------------------------- 主流程 --------------------------------- */

/**
 * 把 PDF 每页渲染成位图后逐页 OCR，返回拼好的纯文本。
 *
 * @param buf PDF 原始字节
 * @param onProgress 进度回调（用于界面上的进度条）
 * @param scale 渲染倍率：3 ≈ 216dpi —— 简历正文字号偏小，
 *              CJK 识别要够高的分辨率才准（150dpi 会把「某某大学」认成乱码）
 */
export async function ocrPdf(
  buf: ArrayBuffer,
  onProgress?: (p: OcrProgress) => void,
  scale = 3,
): Promise<string> {
  const { doc, destroy } = await openPdf(buf);
  let worker: TesseractWorker | null = null;

  try {
    const { createWorker } = await import('tesseract.js');
    const total = doc.numPages;

    worker = await createWorker('chi_sim', 1, {
      workerPath: `${TESSERACT_BASE}/worker.min.js`,
      corePath: `${TESSERACT_BASE}/core`,
      langPath: `${TESSERACT_BASE}/lang`,
      logger: (m: { status?: string; progress?: number }) => {
        // 引擎加载阶段的进度占前 30%，识别占后 70%
        const recognizing = /recognizing text/i.test(m.status || '');
        const base = recognizing ? 0.3 : 0;
        const weight = recognizing ? 0.7 : 0.3;
        onProgress?.({
          progress: Math.min(0.99, base + (m.progress ?? 0) * weight),
          status: translateStatus(m.status || ''),
        });
      },
    });

    const pages: string[] = [];
    for (let i = 1; i <= total; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布上下文');
      // 先铺白底：PDF 的透明背景在 OCR 里会被当成黑底，识别率骤降
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;

      // 要 blocks（词级坐标）才能把分栏还原出来
      const { data } = await worker!.recognize(canvas, {}, { text: true, blocks: true });
      const pageText = ocrResultToText(data);
      if (pageText) pages.push(pageText);
      page.cleanup();
      onProgress?.({
        progress: 0.3 + (0.7 * i) / total,
        status: `识别文字中（${i}/${total} 页）`,
      });
    }

    return pages.join('\n');
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* 忽略：worker 可能已经自行退出 */
      }
    }
    await destroy();
  }
}

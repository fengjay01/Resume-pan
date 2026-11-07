/**
 * 导入简历：把「外部文本 / Word / PDF 文档」解析成本产品的简历结构。
 *
 * 设计原则：
 * - `.txt / .md`：直接按文本读；
 * - `.docx`：它就是一个 zip，用浏览器内置的 `DecompressionStream('deflate-raw')`
 *   解出 `word/document.xml`，再用 DOMParser 抽段落文本（含列表标记）；
 * - `.pdf`：用 **PDF.js（pdfjs-dist）** 按字体 ToUnicode 表还原文字，
 *   并按坐标把文字聚回「行」，保留列间距（中文 PDF 同样适用）；
 * - 解析不出文字（扫描件 / 图片型 PDF）时给出明确指引，不静默丢弃。
 */
import { cloneResume, createResume, createSection } from '@/lib/resume';
import { uid } from '@/lib/id';
import { decodeResumePayload } from '@/lib/resumeEmbed';
import { openPdf } from '@/lib/pdfjs';
import { escapeHtml } from '@/lib/richText';
import type { BasicInfo, ModuleType, Resume, ResumeItem, ResumeSection } from '@/types/resume';

/* --------------------------------- 文件读取 --------------------------------- */

/** 从 ArrayBuffer 里取出 zip 中指定条目的文本（支持 store / deflate） */
async function unzipText(buf: ArrayBuffer, entry: string): Promise<string | null> {
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // 从尾部找 End of Central Directory（可能带注释，向前扫最多 64KB）
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const total = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  for (let i = 0; i < total; i += 1) {
    if (off + 46 > u8.length || view.getUint32(off, true) !== 0x02014b50) break;
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const entryName = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));

    if (entryName === entry) {
      const lNameLen = view.getUint16(localOff + 26, true);
      const lExtraLen = view.getUint16(localOff + 28, true);
      const dataOff = localOff + 30 + lNameLen + lExtraLen;
      const data = u8.subarray(dataOff, dataOff + compSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (typeof DecompressionStream === 'undefined') return null;
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** 解析 docx 的 word/document.xml → 纯文本（列表加「- 」，加粗段落保持原样） */
function docxXmlToText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = Array.from(doc.getElementsByTagName('w:p'));
  const lines: string[] = [];
  paras.forEach((p) => {
    const isList = p.getElementsByTagName('w:numPr').length > 0;
    let text = '';
    Array.from(p.getElementsByTagName('w:t')).forEach((t) => {
      text += t.textContent || '';
    });
    text = text.replace(/\u00a0/g, ' ').trim();
    if (!text) {
      lines.push('');
      return;
    }
    lines.push(isList ? `- ${text}` : text);
  });
  return lines.join('\n');
}

/** PDF 文本片段（把 PDF.js 的 transform 拍平成好用的坐标） */
interface PdfTextChunk {
  str: string;
  /** 基线起点（PDF 坐标，y 轴向上） */
  x: number;
  y: number;
  /** 片段宽度（缺省时按字符数估算） */
  w: number;
  /** 字号（= transform 的 a/b/c/d 缩放量的模长近似） */
  h: number;
}

/** 片段右边界。
 *
 * 有个坑：中文字体里的 ASCII（数字、字母）往往按**整字宽**排版，PDF.js 报出来的
 * `width` 就会明显偏大；直接用它算间隙会得到「负数」，于是「2024.07-至今　某某科技」
 * 会粘成一坨。这里按字符逐个估一个宽度（ASCII 半个字宽、CJK 一个字宽），
 * 再与 PDF 报的宽度取**较小值**——正常字体两者接近，全角字体的虚高被压回真实值。 */
function chunkRight(c: PdfTextChunk): number {
  let est = 0;
  for (const ch of c.str) {
    // 0x2E80 以下（ASCII / 拉丁 / 希腊 / 西里尔 / 常用符号）按半个字宽，其余（CJK）算整字宽
    est += (ch.codePointAt(0) ?? 0) < 0x2e80 ? c.h * 0.5 : c.h;
  }
  const w = c.w > 0 ? Math.min(c.w, est) : est;
  return c.x + w;
}

/**
 * 把一页的文字片段还原成「按版面分行」的纯文本。
 *
 * PDF 里没有「行」的概念，只有一堆各自带坐标的文字片段，所以：
 * - **聚行**：按 y 坐标（PDF 的 y 轴朝上）从上到下排序，纵坐标接近的归为同一行；
 * - **排字**：同一行内按 x 排序。PDF 里的「空格」往往是独立片段，
 *   这些纯空白片段不直接输出，而是用来撑开间隔 —— 于是
 *   「2024.07-至今　某某科技　算法工程师」会还原成 3 个空格分隔的三段，
 *   后面按「两个以上空格」拆「名称 / 职位」的逻辑就能正常工作；
 * - 间隔小于 0.2 个字号的（逐字排版的中文 PDF 常见）不补空格，避免把词拆散。
 */
function layoutTextFromChunks(chunks: PdfTextChunk[]): string[] {
  const rows = chunks.filter((c) => c.str !== '');
  if (!rows.length) return [];
  rows.sort((a, b) => (Math.abs(b.y - a.y) > 0.6 ? b.y - a.y : a.x - b.x));

  const lines: { y: number; h: number; items: PdfTextChunk[] }[] = [];
  rows.forEach((c) => {
    const last = lines[lines.length - 1];
    const ref = last ? Math.min(last.h || 10, c.h || 10) : 10;
    const tol = Math.max(2, ref * 0.5);
    if (last && Math.abs(last.y - c.y) <= tol) {
      last.items.push(c);
      last.h = Math.max(last.h, c.h || 10);
      return;
    }
    lines.push({ y: c.y, h: c.h || 10, items: [c] });
  });

  return lines
    .map((line) => {
      const parts = [...line.items].sort((a, b) => a.x - b.x);
      let out = '';
      let prev: PdfTextChunk | null = null;
      /** 两段文字之间是否夹着「纯空白片段」，以及它从哪里开始 */
      let sawWs = false;
      let wsStart = 0;

      parts.forEach((p) => {
        if (!p.str.trim()) {
          if (!sawWs) {
            wsStart = p.x;
            sawWs = true;
          }
          return; // 空白片段只用来撑开间隔，本身不输出
        }
        if (prev) {
          const fs = Math.max(4, Math.min(prev.h || 10, p.h || 10));
          let spaces: number;
          if (sawWs) {
            // 有显式空格：它的宽度就是真实的间隔宽度，直接据此判断是不是分栏
            spaces = p.x - wsStart >= fs * 1.2 ? 3 : 1;
          } else {
            // 没有空格片段，只能按「上一段的右边界」推算间隙
            const gap = p.x - chunkRight(prev);
            spaces = gap >= fs * 1.6 ? 3 : gap >= fs * 0.2 ? 1 : 0;
          }
          if (spaces) out += ' '.repeat(spaces);
        }
        out += p.str;
        prev = p;
        sawWs = false;
      });

      return out.replace(/^\s+/, '').replace(/\s+$/, '');
    })
    .filter((l) => l.trim() !== '');
}

/** 旧版朴素提取：只解压 FlateDecode 流、收集 Tj/TJ 字面量（PDF.js 不可用时的兜底） */
async function pdfToTextNaive(buf: ArrayBuffer): Promise<string> {
  try {
  const u8 = new Uint8Array(buf);
  const raw = new TextDecoder('latin1').decode(u8);
  const chunks: string[] = [];
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const slice = u8.subarray(start, end);
    let text = '';
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate'));
        text = await new Response(stream).text();
      } catch {
        text = new TextDecoder('latin1').decode(slice);
      }
    } else {
      text = new TextDecoder('latin1').decode(slice);
    }
    if (/\bT[Jj]\b|\bTd\b|\bTD\b/.test(text)) chunks.push(text);
  }
  const out: string[] = [];
  chunks.forEach((c) => {
    const tokens = c.match(/\((?:[^()\\]|\\.)*\)\s*Tj|\[[^\]]*\]\s*TJ|T\*|Td|TD/g) || [];
    let line = '';
    tokens.forEach((tk) => {
      if (tk === 'T*' || tk === 'Td' || tk === 'TD') {
        if (line.trim()) out.push(line.trim());
        line = '';
        return;
      }
      const lits = tk.match(/\((?:[^()\\]|\\.)*\)/g) || [];
      lits.forEach((l) => {
        line += l
          .slice(1, -1)
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\[0-7]{3}/g, ' ');
      });
    });
    if (line.trim()) out.push(line.trim());
  });
  return out.join('\n');
  } catch {
    // 兜底自身也不允许抛异常（否则会掩盖真正的解析错误）
    return '';
  }
}

/**
 * PDF → 文本。
 *
 * 用 **PDF.js（pdfjs-dist）** 解析：它会按字体里的 ToUnicode 表还原真实字符，
 * 中文 PDF 也能正确取到文字（旧的「自己解流」方案对 CID/子集字体会出乱码）。
 * 文字按坐标聚行、按间隙补空格，尽量还原「名称　职位　日期」的排版，
 * 让后面的结构化解析能正常拆分条目。
 *
 * 注意 `pdfjs-dist` 是按需动态加载的（单独 chunk），不进首屏包。
 */
async function pdfToText(
  buf: ArrayBuffer,
): Promise<{ text: string; raw?: string; hint?: string; needsOcr?: boolean; metaPayload?: string }> {
  try {
    const { doc, destroy } = await openPdf(buf);
    // 嵌入数据现在走 **PDF 元数据**（矢量/图片/服务导出都写在 Info 字典里），
    // 正文文本因此是干净的；旧版 PDF（数据藏在不可见文字里）仍走 raw/text 兜底
    let metaPayload: string | null = null;
    try {
      const md = (await doc.getMetadata()) as { info?: Record<string, unknown> } | null;
      const info = md?.info;
      if (info) {
        // pdf.js 会把 Info 字典里的**自定义键**收进 `Custom` 子对象
        const customBag = info['Custom'] as Record<string, unknown> | undefined;
        const custom = customBag ? customBag['XlpResume'] : undefined;
        if (typeof custom === 'string' && custom.includes('XLPAN-RESUME')) metaPayload = custom;
        const kw = info['Keywords'];
        if (!metaPayload && typeof kw === 'string' && kw.includes('XLPAN-RESUME')) metaPayload = kw;
      }
    } catch {
      /* 元数据读不到不影响文本提取 */
    }
    const pages: string[] = [];
    /** 原始提取文本（未做布局分组）：嵌入数据的解码用它更可靠 */
    const rawPages: string[] = [];
    try {
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const chunks: PdfTextChunk[] = [];
        (content.items as unknown[]).forEach((raw) => {
          const it = raw as {
            str?: string;
            width?: number;
            height?: number;
            transform?: number[];
          };
          if (typeof it.str !== 'string' || !it.str) return;
          const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
          chunks.push({
            str: it.str,
            x: tr[4] ?? 0,
            y: tr[5] ?? 0,
            w: typeof it.width === 'number' ? it.width : 0,
            h: Math.abs(tr[3] ?? 0) || it.height || 10,
          });
        });
        const lines = layoutTextFromChunks(chunks);
        if (lines.length) pages.push(lines.join('\n'));
        rawPages.push(chunks.map((c) => c.str).join(''));
        page.cleanup();
      }
    } finally {
      await destroy();
    }

    const text = pages
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const raw = rawPages.join('\n').trim();
    if (!text) {
      return {
        text: '',
        raw,
        metaPayload: metaPayload ?? undefined,
        needsOcr: true,
        hint: '这份 PDF 里没有可直接提取的文字（图片版 / 扫描件），需要用「文字识别（OCR）」把页面上的字读出来。',
      };
    }
    // 质量闸门：可读字符占比过低说明是乱码（异常字体/加密），提示改用粘贴
    const printable = (text.match(/[\u4e00-\u9fa5A-Za-z0-9，。、；：（）()·\-—\s]/g) || []).length;
    const ratio = printable / text.length;
    if (ratio < 0.6) {
      return {
        text,
        raw,
        metaPayload: metaPayload ?? undefined,
        needsOcr: true,
        hint: '这份 PDF 的文字编码比较特殊，直接提取可能有乱码，建议改用「文字识别（OCR）」。',
      };
    }
    return { text, raw, metaPayload: metaPayload ?? undefined };
  } catch (err) {
    // PDF.js 不可用（极端环境）时退回朴素提取；把具体原因带给用户
    const msg = err instanceof Error ? err.message : String(err);
    const naive = await pdfToTextNaive(buf);
    if (!naive.trim()) {
      return {
        text: '',
        needsOcr: true,
        hint: `PDF 解析失败（${msg}）。可以试试「文字识别（OCR）」，或打开 PDF 全选复制后走「粘贴文本」。`,
      };
    }
    return { text: naive, hint: `已用兼容方式提取 PDF 文字（原解析失败：${msg}），若有乱码请改用「文字识别（OCR）」。` };
  }
}

/** 读取上传的简历文件 → 文本（失败时返回 hint 说明原因） */
export async function readResumeFile(
  file: File,
): Promise<{ text: string; hint?: string; needsOcr?: boolean; embedded?: Resume }> {
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith('.docx')) {
      const buf = await file.arrayBuffer();
      const xml = await unzipText(buf, 'word/document.xml');
      if (!xml) return { text: '', hint: '这个 .docx 解析失败，请在 Word 里另存为新的 .docx 再试。' };
      return { text: docxXmlToText(xml) };
    }
    if (lower.endsWith('.doc')) {
      return { text: '', hint: '旧版 .doc 无法直接解析，请用 Word 另存为 .docx 后再上传。' };
    }
    if (lower.endsWith('.pdf')) {
      const result = await pdfToText(await file.arrayBuffer());
      // 本产品导出的 PDF 里嵌着整份简历的数据 —— 识别到就直接 1:1 原样恢复，
      // 不走「从文字反推结构」的有损解析。优先级：① PDF 元数据（新版矢量/图片/
      // 服务导出）；② 原始提取文本（旧版不可见文字 / 打印对话框兜底路径）。
      const embedded =
        (result.metaPayload ? await decodeResumePayload(result.metaPayload) : null) ??
        (await decodeResumePayload(result.raw || '')) ??
        (result.text ? await decodeResumePayload(result.text) : null);
      if (embedded) return { text: '', embedded };
      return result;
    }
    if (/\.(txt|md|markdown|text)$/.test(lower) || file.type.startsWith('text/')) {
      return { text: await file.text() };
    }
    // 图片（扫描件/截图）：明确提示，别把二进制当文本读出来
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?|svg)$/.test(lower)) {
      return {
        text: '',
        hint: '图片简历无法直接识别文字。建议：① 把图片里的文字手动敲/复制到「粘贴文本」；② 或上传 Word（.docx）版本。',
      };
    }
    // 兜底：当纯文本读，但先检查是不是可读文本（二进制会有大量控制字符）
    const text = await file.text();
    const printable = (text.match(/[\u4e00-\u9fa5A-Za-z0-9，。、；：（）()·\-—\s]/g) || []).length;
    if (text.trim() && printable / Math.max(1, text.length) > 0.9) return { text };
    return {
      text: '',
      hint: '这个文件解析不出文字，请上传 .pdf / .docx / .txt，或直接把简历文字粘贴进来。',
    };
  } catch {
    return { text: '', hint: '文件读取失败，请重试或改用「粘贴文本」。' };
  }
}

/**
 * 用「PDF 里嵌着的完整数据」构建一份新简历：内容、模块、排版原样保留，只换新 id。
 */
export function resumeFromEmbedded(embedded: Resume, name?: string): Resume {
  return cloneResume(embedded, name?.trim() || embedded.name);
}

/**
 * 对「图片型 PDF」做文字识别（OCR）。
 * 只有用户主动点击「文字识别」时才会调用 —— Tesseract 与中文模型体积不小，
 * 而且识别一张 A4 需要十几秒，不适合自动触发。
 */
export async function ocrResumeFile(
  file: File,
  onProgress?: (p: { progress: number; status: string }) => void,
): Promise<{ text: string; hint?: string }> {
  const { ocrPdf } = await import('@/lib/pdfOcr');
  try {
    const text = await ocrPdf(await file.arrayBuffer(), onProgress);
    if (!text.trim()) {
      return {
        text: '',
        hint: '没有识别出文字。可能页面分辨率太低或全是图形，建议改用「粘贴文本」手动整理。',
      };
    }
    return {
      text,
      hint: '已完成文字识别。OCR 结果可能有少量错字，导入后可在编辑器里顺手校对。',
    };
  } catch (err) {
    return {
      text: '',
      hint: `文字识别失败：${err instanceof Error ? err.message : '未知错误'}。可以改用「粘贴文本」。`,
    };
  }
}

/* ---------------------------------- 文本解析 ---------------------------------- */

/** 章节关键词 → 模块类型（顺序敏感：先匹配更长/更具体的） */
const SECTION_KEYS: { key: string; type: ModuleType | 'basic' }[] = [
  { key: '个人信息', type: 'basic' },
  { key: '基本信息', type: 'basic' },
  { key: '联系方式', type: 'basic' },
  { key: '教育背景', type: 'education' },
  { key: '教育经历', type: 'education' },
  { key: '学习经历', type: 'education' },
  { key: '学历信息', type: 'education' },
  { key: '专业技能', type: 'skills' },
  { key: '技能特长', type: 'skills' },
  { key: '技术栈', type: 'skills' },
  { key: '专业能力', type: 'skills' },
  { key: '技能', type: 'skills' },
  { key: '实习经历', type: 'internship' },
  { key: '实习经验', type: 'internship' },
  { key: '工作经历', type: 'work' },
  { key: '工作经验', type: 'work' },
  { key: '职业经历', type: 'work' },
  { key: '工作履历', type: 'work' },
  { key: '项目经历', type: 'project' },
  { key: '项目经验', type: 'project' },
  { key: '项目实践', type: 'project' },
  { key: '主要项目', type: 'project' },
  { key: '校园经历', type: 'campus' },
  { key: '社团经历', type: 'campus' },
  { key: '学生工作', type: 'campus' },
  { key: '组织经历', type: 'campus' },
  { key: '获奖情况', type: 'award' },
  { key: '获奖经历', type: 'award' },
  { key: '荣誉奖项', type: 'award' },
  { key: '荣誉', type: 'award' },
  { key: '奖项', type: 'award' },
  { key: '奖励', type: 'award' },
  { key: '科研经历', type: 'research' },
  { key: '科研成果', type: 'research' },
  { key: '学术成果', type: 'research' },
  { key: '科研', type: 'research' },
  { key: '自我评价', type: 'selfEval' },
  { key: '自我介绍', type: 'selfEval' },
  { key: '个人评价', type: 'selfEval' },
  { key: '个人总结', type: 'selfEval' },
  { key: '自我描述', type: 'selfEval' },
];

/** 标题行归一化：去空白 / 序号 / 装饰符 */
function normalizeHeading(line: string): string {
  return line
    .replace(/[\s\u3000]/g, '')
    .replace(/^[0-9一二三四五六七八九十]+[、.．)）]\s*/, '')
    .replace(/^[【\[（(★☆◆◇●○·•\-—_]+/, '')
    .replace(/[】\]）)★☆◆◇●○·•\-—_：:]+$/, '')
    .trim();
}

/** 判断一行是不是章节标题（返回模块类型或自定义标题）
 *  `idx`：该行是在正文里第几个非空行（前两行通常是姓名/联系方式，不做自定义标题判定） */
function matchHeading(raw: string, idx = 99): { type: ModuleType | 'basic'; title: string } | null {
  const line = raw.trim();
  if (!line || line.length > 20) return null;
  // 「主要工作：」这类是条目标签而不是章节标题 —— 带冒号的短行一律不算标题
  if (/[：:]$/.test(line)) return null;
  const norm = normalizeHeading(line);
  if (!norm) return null;
  for (const { key, type } of SECTION_KEYS) {
    // 完全命中关键词时用「关键词」当标题 —— 粘进来的可能是「一、教育背景」，
    // OCR 出来还可能是「教育 背景」（Tesseract 会往中文里塞空格），统一成规范写法
    if (norm === key) return { type, title: key };
    // 允许「教育背景 EDUCATION」这类中英混排
    if (norm.startsWith(key) && norm.length <= key.length + 12) return { type, title: line };
  }
  // 未知的短标题（无标点、无数字）→ 自定义模块；开头两行是姓名/联系方式，排除掉
  if (
    idx >= 2 &&
    norm.length <= 8 &&
    !/[，。；：、,.;:]/.test(norm) &&
    !/\d/.test(norm) &&
    !/@/.test(norm) &&
    /[\u4e00-\u9fa5]/.test(norm)
  ) {
    return { type: 'custom', title: line };
  }
  return null;
}

/** 时间范围：2020.09-2024.06 / 2020/9 – 至今 / 2020年9月~2024年6月 */
function matchDateRange(line: string): { start: string; end: string; current: boolean; rest: string } | null {
  const re =
    /((?:19|20)\d{2})\s*[年.\-/]\s*(\d{1,2})?\s*月?\s*[-–—~至到]+\s*((?:19|20)\d{2}|至今|现在|今|present|now)?\s*[年.\-/]?\s*(\d{1,2})?\s*月?/i;
  const m = re.exec(line);
  if (!m) return null;
  const pad = (s: string, d = '01') => (s || d).padStart(2, '0');
  const start = `${m[1]}-${pad(m[2])}`;
  const endRaw = (m[3] || '').trim();
  const current = !endRaw || /至今|现在|今|present|now/i.test(endRaw);
  const end = current ? '' : `${endRaw}-${pad(m[4])}`;
  // 注意：这里只去掉日期本身，**不要合并行内空白** ——
  // 后面的 name / role 拆分依赖「两个以上空格」或竖线分隔。
  return { start, end, current, rest: line.replace(m[0], ' ').trim() };
}

/** 单个日期（2024.06 / 2024年6月）——用于「获奖日期」这类字段 */
function matchSingleDate(line: string): string | null {
  const m = /((?:19|20)\d{2})\s*[年.\-/]\s*(\d{1,2})?\s*月?/.exec(line);
  if (!m) return null;
  return `${m[1]}-${(m[2] || '01').padStart(2, '0')}`;
}

/** 项目符号行 */
const BULLET_RE = /^\s*[•·▪◦●○◆◇★☆\-–—*※>»]\s*|^\s*[（(]?\d{1,2}[)）.、]\s*/;

/** 干净的段落 HTML：短标签（冒号结尾）自动加粗，列表行转 <ul><li> */
function linesToRichHtml(lines: string[]): string {
  const out: string[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length) {
      out.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`);
      bullets = [];
    }
  };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const isIndent = /^[\s\u3000]{2,}/.test(raw) && !BULLET_RE.test(raw);
    const body = BULLET_RE.test(line) ? line.replace(BULLET_RE, '') : line;
    const labelMatch = /^([^：:]{1,14})[：:]$/.exec(body);
    const html =
      labelMatch && /[\u4e00-\u9fa5A-Za-z]/.test(labelMatch[1])
        ? `<strong>${escapeHtml(body)}</strong>`
        : escapeHtml(body);
    if (BULLET_RE.test(line)) {
      bullets.push(html);
      return;
    }
    flushBullets();
    out.push(isIndent ? `<p style="padding-left:2em">${html}</p>` : `<p>${html}</p>`);
  });
  flushBullets();
  return out.join('');
}

/** 把一段正文拆成若干「条目」 */
function parseItems(type: ModuleType, body: string[]): ResumeItem[] {
  const items: ResumeItem[] = [];
  let cur: { meta: string | null; date: ReturnType<typeof matchDateRange>; lines: string[] } | null = null;

  const push = () => {
    if (!cur) return;
    const date = cur.date;
    let name = '';
    let role = '';
    const metaRest = (cur.meta || '').trim();
    if (metaRest) {
      const parts = metaRest.split(/\s{2,}|[|｜·／/]\s*|,\s*|\t/).map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = parts[0];
        role = parts.slice(1).join(' ');
      } else {
        name = metaRest;
      }
    }
    const rest = [...cur.lines];
    if (!name) {
      // 不用「项目符号行」当名称（那多半是正文）
      const idx = rest.findIndex((l) => l.trim() && !BULLET_RE.test(l));
      if (idx >= 0) name = rest.splice(idx, 1)[0].trim();
    }
    if (!role) {
      // 职位/专业：短行、且不是「主要工作：」这类小标题、也不是项目符号行
      const idx = rest.findIndex((l) => {
        const t = l.trim();
        return t.length > 0 && t.length <= 18 && !/[：:]$/.test(t) && !BULLET_RE.test(t);
      });
      if (idx >= 0) role = rest.splice(idx, 1)[0].trim();
    }
    const item: ResumeItem = {
      id: uid('it'),
      name,
      role,
      label: '',
      labelValue: '',
      startDate: date?.start ?? '',
      endDate: date?.end ?? '',
      current: date?.current ?? false,
      content: linesToRichHtml(rest),
    };
    if (type === 'award' && date) {
      item.label = '获奖日期';
      item.labelValue = date.start;
    }
    if (name || role || item.content) items.push(item);
    cur = null;
  };

  body.forEach((line) => {
    if (!line.trim()) return;
    const date = matchDateRange(line);
    const trimmed = line.trim();
    // 「主要工作：」这类以冒号结尾的短标签是**条目内部的小标题**，不能当成新条目的开头
    const isLabel = /[：:]$/.test(trimmed) && trimmed.length <= 14;
    const shortish = trimmed.length <= 32;
    const looksLikeHeader =
      date !== null || (shortish && !isLabel && !BULLET_RE.test(line) && !/[。；;]$/.test(trimmed));
    if (!cur) {
      cur = { meta: null, date: null, lines: [] };
    } else if (date || (looksLikeHeader && (cur.date || cur.lines.length >= 2))) {
      // 上一段已经攒够信息，且这一行像是新条目的头部 → 开新条目
      push();
      cur = { meta: null, date: null, lines: [] };
    }
    if (date) {
      cur!.date = date;
      if (date.rest) cur!.meta = date.rest;
    } else if (!cur!.date && !cur!.meta && looksLikeHeader) {
      cur!.meta = trimmed;
    } else {
      cur!.lines.push(line);
    }
  });
  push();
  return items;
}

export interface ImportResult {
  basic: Partial<BasicInfo>;
  sections: ResumeSection[];
  /** 统计信息，用于导入后的提示 */
  summary: { sections: number; items: number; detectedBasic: string[] };
  /** 是否走了「整篇原文」兜底 */
  fallback: boolean;
}

/** 解析简历文本 → 基本信息和模块 */
export function parseResumeText(input: string): ImportResult {
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\u3000]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));
  while (text.length && !text[0].trim()) text.shift();

  // 1) 先按标题切块
  type Chunk = { type: ModuleType | 'basic'; title: string; lines: string[] };
  const chunks: Chunk[] = [];
  const headLines: string[] = [];
  let cur: Chunk | null = null;
  let seenTextLines = 0;

  text.forEach((line) => {
    const heading = matchHeading(line, seenTextLines);
    if (line.trim()) seenTextLines += 1;
    if (heading) {
      cur = { type: heading.type, title: heading.title, lines: [] };
      chunks.push(cur);
      return;
    }
    if (cur) cur.lines.push(line);
    else headLines.push(line);
  });

  // 2) 基本信息
  const all = text.join('\n');
  const basic: Partial<BasicInfo> = {};
  const detected: string[] = [];
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(all);
  if (email) {
    basic.email = email[0];
    detected.push('邮箱');
  }
  const phone = /(?:^|\D)(1[3-9]\d{9})(?:\D|$)/.exec(all);
  if (phone) {
    basic.phone = phone[1];
    detected.push('电话');
  }
  const intention = /(?:求职意向|期望职位|求职岗位|目标岗位|应聘职位)[：: ]*([^\n]{2,30})/.exec(all);
  if (intention) {
    basic.jobIntention = intention[1].trim();
    detected.push('求职意向');
  }
  const political = /(中共党员|中共预备党员|预备党员|共青团员|群众|党员)/.exec(all);
  if (political) {
    basic.politicalStatus = political[1];
    detected.push('政治面貌');
  }
  if (/男/.test(all.slice(0, 600))) {
    basic.gender = 'male';
    detected.push('性别');
  } else if (/女/.test(all.slice(0, 600))) {
    basic.gender = 'female';
    detected.push('性别');
  }
  const years = /(应届生|应届毕业生|\d+\s*年(?:工作)?经验|\d+\s*年经验)/.exec(all);
  if (years) {
    basic.workYears = years[1].replace(/\s+/g, '');
    detected.push('工作年限');
  }
  // 姓名：正文第一行里最像名字的短行（2-4 个汉字，不含数字与标点）
  const nameCandidate = [...headLines, ...text.slice(0, 5)]
    .map((l) => l.trim())
    .find((l) => /^[\u4e00-\u9fa5]{2,4}$/.test(l) && !/大学|学院|公司|简历|个人/.test(l));
  if (nameCandidate) {
    basic.name = nameCandidate;
    detected.push('姓名');
  }

  // 3) 模块
  const sections: ResumeSection[] = [];
  let itemCount = 0;
  chunks.forEach((c) => {
    if (c.type === 'basic') return; // 基本信息已单独提取
    const body = c.lines.filter((l, i, arr) => !(l === '' && (i === 0 || arr[i - 1] === '')));
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (!body.length) return;

    if (c.type === 'custom') {
      const sec = createSection('custom', c.title);
      sec.content = linesToRichHtml(body);
      sections.push(sec);
      return;
    }
    const sec = createSection(c.type);
    sec.title = c.title || sec.title;
    if (sec.kind === 'rich') {
      sec.content = linesToRichHtml(body);
    } else if (c.type === 'award') {
      // 获奖：一行一条，尽量抽日期
      sec.items = body
        .filter((l) => l.trim())
        .map((l) => {
          const d = matchSingleDate(l);
          const withoutDate = d ? l.replace(/((?:19|20)\d{2})\s*[年.\-/]\s*(\d{1,2})?\s*月?/, ' ') : l;
          const item: ResumeItem = {
            id: uid('it'),
            name: (BULLET_RE.test(withoutDate)
              ? withoutDate.replace(BULLET_RE, '')
              : withoutDate
            )
              .replace(/\s{2,}/g, ' ')
              .trim(),
            role: '',
            label: d ? '获奖日期' : '',
            labelValue: d ?? '',
            startDate: '',
            endDate: '',
            current: false,
            content: '',
          };
          return item;
        });
    } else {
      sec.items = parseItems(c.type, body);
    }
    itemCount += sec.items.length;
    sections.push(sec);
  });

  // 4) 一个模块都没识别出来 → 兜底：整篇原文放进自定义模块，绝不让内容丢失
  let fallback = false;
  if (!sections.length) {
    fallback = true;
    const sec = createSection('custom', '简历内容');
    sec.content = linesToRichHtml(text.filter((l) => l.trim()));
    sections.push(sec);
  }

  return {
    basic,
    sections,
    summary: { sections: sections.length, items: itemCount, detectedBasic: detected },
    fallback,
  };
}

/** 用解析结果构建一份可编辑的简历 */
export function buildResumeFromImport(
  result: ImportResult,
  templateId: string,
  name: string,
): Resume {
  const base = createResume(templateId, name);
  return {
    ...base,
    name,
    basic: { ...base.basic, ...result.basic },
    sections: result.sections,
  };
}

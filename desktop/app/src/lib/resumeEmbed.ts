/**
 * 把整份简历「藏」进导出的 PDF 里，让导入时能 1:1 原样恢复。
 *
 * 通道：**PDF 元数据 /Keywords**（标准键，pdf.js 的 getMetadata 读得到）。
 * 早期方案是把 base64 以白色 1px「不可见文字」塞进每页页底 —— 复制/提取 PDF
 * 文本时会带出一大段乱码（用户反馈「有很多字母出现」），已全部废除：
 *   · 渲染服务路径：服务端渲染后注入元数据（见 tools/export-service.mjs）；
 *   · 图片版路径：jsPDF setProperties({ keywords })；
 *   · 打印对话框路径：浏览器自己生成的 PDF 没有元数据通道，导入时走文本结构
 *     解析兜底（decodeResumePayload 仍会尝试识别旧版导出里的不可见文字）。
 *
 * 编码链：JSON → UTF-8 → deflate-raw → base64（压缩后只有 2~4KB）。
 * 全程 ASCII（base64），不受 PDF 字体/编码影响，也不怕提取时插入的空格（解码前先去空白）。
 */
import type { Resume } from '@/types/resume';

/** 数据块开头标记（放在不可见文本的最前面，导入时靠它定位） */
export const EMBED_MARKER = 'XLPAN-RESUME-V1';
/** 数据块结束标记 */
export const EMBED_END = 'XLPAN-RESUME-END';

/* ------------------------------- base64 / 压缩 ------------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // String.fromCharCode 参数上限，分块拼
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(str: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(
    new CompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return await new Response(stream).text();
}

/* --------------------------------- 编码 / 解码 --------------------------------- */

/** 生成要嵌进 PDF 元数据的载荷（一段 base64，无任何空白） */
export async function encodeResumePayload(resume: Resume): Promise<string> {
  const packed = await deflate(JSON.stringify(resume));
  return `${EMBED_MARKER}:${bytesToBase64(packed)}:${EMBED_END}`;
}

/**
 * 从「PDF 提取出的文本 / 元数据」里找嵌入的简历数据。
 * 提取时可能被塞进空格、也可能和正文交错，所以先把整段文本的空白全部去掉再找标记；
 * 解不出来（数据被破坏 / 不是我们的导出）就返回 null，让调用方走普通解析。
 */
export async function decodeResumePayload(text: string): Promise<Resume | null> {
  const flat = text.replace(/\s+/g, '');
  // 旧版导出每页都塞了一份（防止某一页的数据被正文污染），逐份尝试，
  // 第一份能解出来的就用；元数据通道只有一份。
  let from = 0;
  while (true) {
    const start = flat.indexOf(EMBED_MARKER, from);
    if (start < 0) return null;
    from = start + EMBED_MARKER.length;
    const end = flat.indexOf(EMBED_END, from);
    const stop = end > 0 ? end : flat.length;
    // 只留 base64 字符：数据块两侧的「:」分隔符、混进来的正文标点都清掉
    const b64 = flat
      .slice(from, stop)
      .replace(/[^A-Za-z0-9+/=]/g, '');
    if (b64.length < 16) continue;
    try {
      const json = await inflate(base64ToBytes(b64));
      const data = JSON.parse(json) as Resume;
      // 结构校验：必须是像样的简历对象，避免把随便一段文字当成数据
      if (!data || typeof data !== 'object') continue;
      if (!Array.isArray(data.sections) || !data.style || !data.basic) continue;
      return data;
    } catch {
      /* 这一份坏了（被正文污染），试下一份 */
    }
  }
}

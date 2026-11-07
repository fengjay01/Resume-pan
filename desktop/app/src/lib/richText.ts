/** 富文本（HTML）相关小工具 */

/** 去掉 HTML 标签，判断内容是否为空（仅空白视为空） */
export function plainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** 富文本是否为空 */
export function isRichEmpty(html: string): boolean {
  return plainText(html).length === 0;
}

/** 转义为 HTML 文本 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 极简 Markdown 内联转换：**加粗** / *斜体* / `代码`
 * 用于满足「支持 Markdown 语法书写」的基础诉求。
 */
export function inlineMarkdownToHtml(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

/**
 * 极简 Markdown 块级转换：`- ` 无序列表、`1. ` 有序列表、空行分段。
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inlineMarkdownToHtml(ul[1])}</li>`);
    } else if (ol) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inlineMarkdownToHtml(ol[1])}</li>`);
    } else {
      closeList();
      html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
    }
  }
  closeList();
  return html.join('');
}

/* ------------------------ 粘贴清洗：保结构、去字体 ------------------------ */

/** 直接丢弃的标签（脚本/样式/媒体/表单控件/图片——简历富文本不支持图片） */
const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'SOURCE', 'SVG', 'CANVAS', 'MAP', 'AREA', 'TEMPLATE',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'OPTGROUP', 'LABEL',
  'FIELDSET', 'LEGEND', 'DIALOG', 'PROGRESS', 'METER', 'OUTPUT', 'XML', 'COL',
]);

/** 保留结构的块级标签 */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP',
]);

/** 行内标签（按语义重建，不保留原样式） */
const INLINE_TAGS = new Set([
  'SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'INS', 'S', 'STRIKE', 'DEL',
  'SUB', 'SUP', 'CODE', 'MARK', 'SMALL', 'BIG', 'TT', 'A', 'CITE', 'Q', 'VAR',
  'KBD', 'SAMP', 'ABBR', 'ACRONYM', 'TIME', 'BDI', 'BDO', 'RUBY', 'RB', 'RT', 'RP', 'WBR',
]);

/** 段落对齐（属于版式，保留） */
const ALIGN_OK = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

/** 列表符号（属于版式，保留） */
const LIST_STYLE_OK = new Set([
  'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero',
  'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha', 'lower-greek',
  'none', 'inherit',
]);

/** 长度换算成 px（不认识或百分比返回 null，宁可不保留也不乱套） */
function lengthToPx(value: string): number | null {
  const m = /^(-?[\d.]+)\s*(px|pt|em|rem|cm|mm|in)?$/i.exec((value || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch ((m[2] || 'px').toLowerCase()) {
    case 'px':
      return n;
    case 'pt':
      return (n * 4) / 3;
    case 'em':
    case 'rem':
      return n * 14; // 按简历正文字号估算
    case 'cm':
      return n * 37.8;
    case 'mm':
      return n * 3.78;
    case 'in':
      return n * 96;
    default:
      return null;
  }
}

/** 解析内联 style 为键值表 */
function parseStyle(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = el.getAttribute('style') || '';
  raw.split(';').forEach((rule) => {
    const i = rule.indexOf(':');
    if (i <= 0) return;
    const k = rule.slice(0, i).trim().toLowerCase();
    const v = rule.slice(i + 1).trim();
    if (k && v) out[k] = v;
  });
  return out;
}

/** 一块内容里的行内语义（避免重复套 strong/em） */
interface InlineCtx {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

/**
 * 清洗外部粘贴的 HTML：**保留版式结构，只剥离字体格式**。
 *
 * - 保留：加粗 / 斜体 / 下划线 / 删除线、段落与换行、有序无序列表、缩进、对齐、
 *   表格结构、链接（仅 http/https）；
 * - 丢弃：字体族、字号、颜色、背景、行高、边框（表格边框除外）等 ——
 *   这些交给模板统一决定，实现「字体跟模板一致，但布局格式保持粘贴前的样子」；
 * - 表格外的一切分栏/定位排版（float/position/display）一律丢弃，避免撑破纸张。
 */
export function sanitizePastedHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return '';
  }
  const body = doc.body;

  // Word 会塞一堆 mso 条件注释与 style/script，先清掉
  body.querySelectorAll('script, style, meta, link, title, noscript').forEach((el) => el.remove());
  const comments: Comment[] = [];
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);
  comments.forEach((c) => c.remove());

  const out = doc.createElement('div');

  /** 该元素自身带的行内语义（标签语义 + 内联样式） */
  const semanticOf = (el: Element, st: Record<string, string>) => {
    const tag = el.tagName.toUpperCase();
    const weight = (st['font-weight'] || '').toLowerCase();
    const style = (st['font-style'] || '').toLowerCase();
    const deco = (st['text-decoration'] || st['text-decoration-line'] || '').toLowerCase();
    return {
      bold:
        tag === 'B' ||
        tag === 'STRONG' ||
        weight === 'bold' ||
        weight === 'bolder' ||
        (Number.parseInt(weight, 10) >= 600 && Number.isFinite(Number.parseInt(weight, 10))),
      italic: tag === 'I' || tag === 'EM' || style === 'italic' || style === 'oblique',
      underline: tag === 'U' || tag === 'INS' || deco.includes('underline'),
      strike: tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || deco.includes('line-through'),
    };
  };

  /** 保留的版式样式（字体类一律不保留） */
  const layoutStyle = (el: Element, st: Record<string, string>, tag: string) => {
    const keep: string[] = [];
    const align = (st['text-align'] || el.getAttribute('align') || '').toLowerCase();
    if (ALIGN_OK.has(align)) keep.push(`text-align:${align}`);

    // 缩进：margin-left / padding-left / text-indent 统一折算成 padding-left
    const indentPx =
      lengthToPx(st['margin-left'] || '') ??
      lengthToPx(st['padding-left'] || '') ??
      lengthToPx(st['text-indent'] || '');
    if (indentPx !== null && indentPx > 0) {
      keep.push(`padding-left:${Math.max(0, Math.min(Math.round(indentPx), 140))}px`);
    }

    if (tag === 'UL' || tag === 'OL') {
      const ls = (st['list-style-type'] || '').toLowerCase();
      if (LIST_STYLE_OK.has(ls)) keep.push(`list-style-type:${ls}`);
    }

    if (tag === 'TD' || tag === 'TH') {
      const va = (st['vertical-align'] || '').toLowerCase();
      if (['top', 'middle', 'bottom'].includes(va)) keep.push(`vertical-align:${va}`);
      const w = (st['width'] || el.getAttribute('width') || '').trim();
      if (/^\d+(\.\d+)?%$/.test(w)) keep.push(`width:${w}`);
      // 表格边框：原来有边框的才画，且统一成模板色，不搬原色
      const border = (st['border'] || st['border-top'] || st['border-bottom'] || '').toLowerCase();
      if (border && !border.includes('none') && !border.startsWith('0')) {
        keep.push('border:1px solid rgba(0,0,0,.16)');
      }
    }
    return keep.length ? keep.join(';') : '';
  };

  /** 把语义包成标签（固定顺序 strong > em > u > s，保证结果稳定） */
  const wrapChildren = (from: Node, dest: Node, sem: InlineCtx) => {
    const chain = [
      sem.bold && 'strong',
      sem.italic && 'em',
      sem.underline && 'u',
      sem.strike && 's',
    ].filter(Boolean) as string[];
    if (!chain.length) {
      while (from.firstChild) dest.appendChild(from.firstChild);
      return;
    }
    let outer: HTMLElement | null = null;
    let cursor: HTMLElement | null = null;
    chain.forEach((t) => {
      const node = doc.createElement(t);
      if (cursor) cursor.appendChild(node);
      else outer = node;
      cursor = node;
    });
    while (from.firstChild) cursor!.appendChild(from.firstChild);
    dest.appendChild(outer!);
  };

  /** 递归转换：把 src 的子节点转换后追加到 dest */
  const convert = (src: Node, dest: Node, ctx: InlineCtx) => {
    Array.from(src.childNodes).forEach((child) => {
      // 文本
      if (child.nodeType === 3) {
        const t = child.textContent || '';
        if (t) dest.appendChild(doc.createTextNode(t));
        return;
      }
      if (child.nodeType !== 1) return;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) return;

      const st = parseStyle(el);

      // 换行 / 分隔线
      if (tag === 'BR') {
        dest.appendChild(doc.createElement('br'));
        return;
      }
      if (tag === 'HR') {
        dest.appendChild(doc.createElement('hr'));
        return;
      }

      // 行内元素：重建语义，样式一律丢弃（字体/颜色由模板决定）
      if (INLINE_TAGS.has(tag) && !BLOCK_TAGS.has(tag)) {
        const sem = semanticOf(el, st);
        const nextCtx: InlineCtx = {
          bold: ctx.bold || sem.bold,
          italic: ctx.italic || sem.italic,
          underline: ctx.underline || sem.underline,
          strike: ctx.strike || sem.strike,
        };
        const inner = doc.createElement('span');
        if (tag === 'SUB' || tag === 'SUP') {
          const sup = doc.createElement(tag.toLowerCase());
          convert(el, sup, nextCtx);
          if (sup.textContent || sup.querySelector('br')) dest.appendChild(sup);
          return;
        }
        if (tag === 'CODE') {
          const code = doc.createElement('code');
          convert(el, code, nextCtx);
          if (code.textContent) dest.appendChild(code);
          return;
        }
        convert(el, inner, nextCtx);
        const text = inner.textContent || '';
        const hasNode = inner.childNodes.length > 0;
        if (!hasNode || !text.trim()) {
          // 空壳（无内容）直接丢弃；有 <br> 等结构则保留结构
          if (!inner.querySelector('br')) return;
        }
        // 链接：只留 http/https
        if (tag === 'A') {
          const href = el.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) {
            const a = doc.createElement('a');
            a.setAttribute('href', href);
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noreferrer');
            while (inner.firstChild) a.appendChild(inner.firstChild);
            dest.appendChild(a);
            return;
          }
          // 非法链接 → 只保内容
          while (inner.firstChild) dest.appendChild(inner.firstChild);
          return;
        }
        // 只对「这一段里新增的语义」包标签，避免 <strong><strong> 套娃
        const added: InlineCtx = {
          bold: sem.bold && !ctx.bold,
          italic: sem.italic && !ctx.italic,
          underline: sem.underline && !ctx.underline,
          strike: sem.strike && !ctx.strike,
        };
        wrapChildren(inner, dest, added);
        return;
      }

      // 块级元素
      if (BLOCK_TAGS.has(tag)) {
        const style = layoutStyle(el, st, tag);
        let outTag = tag.toLowerCase();
        // 标题 / 引用 / 预格式：统一成「加粗段落」「缩进段落」，字号交给模板
        if (/^H[1-6]$/.test(tag)) outTag = 'p';
        else if (tag === 'BLOCKQUOTE') outTag = 'p';
        else if (tag === 'PRE') outTag = 'p';
        else if (tag === 'DIV') outTag = 'div';

        const node = doc.createElement(outTag);
        const blockCtx: InlineCtx = { bold: false, italic: false, underline: false, strike: false };
        if (style) node.setAttribute('style', style);

        convert(el, node, blockCtx);

        // 块级元素自带的语义（标题 / font-weight:bold 的 li、p…）→ 包住整块内容
        const blockSem = semanticOf(el, st);
        if (/^H[1-6]$/.test(tag)) blockSem.bold = true;
        if (blockSem.bold || blockSem.italic || blockSem.underline || blockSem.strike) {
          const only = node.firstElementChild;
          const already =
            node.childNodes.length === 1 &&
            !!only &&
            ['STRONG', 'B'].includes(only.tagName.toUpperCase()) &&
            blockSem.bold;
          if (!already) {
            const holder = doc.createElement('span');
            while (node.firstChild) holder.appendChild(node.firstChild);
            wrapChildren(holder, node, blockSem);
          }
        }

        // 引用块 → 缩进段落（视觉上等价，但不引入默认字体/边距）
        if (tag === 'BLOCKQUOTE' && !style) node.setAttribute('style', 'padding-left:2em');

        // 空段落（没有文字也没有换行）不保留，避免粘出一片空白
        const emptyEl =
          !(node.textContent || '').trim() &&
          !node.querySelector('br') &&
          !node.querySelector('table, ul, ol, hr');
        if (emptyEl && (outTag === 'p' || outTag === 'div')) return;

        dest.appendChild(node);
        return;
      }

      // 未知标签：解包，只保留内容（字体类容器 div/section/article 等）
      convert(el, dest, ctx);
    });
  };

  convert(body, out, { bold: false, italic: false, underline: false, strike: false });

  // 顶层是裸行内内容时包成段落，保证编辑器里的块结构稳定
  const hasBlock = Array.from(out.childNodes).some(
    (n) => n.nodeType === 1 && BLOCK_TAGS.has((n as Element).tagName.toUpperCase()),
  );
  let html2 = out.innerHTML;
  if (!hasBlock && (out.textContent || '').trim()) {
    html2 = `<p>${html2}</p>`;
  }

  // 连续空段落压缩成一个，去掉结尾空段
  html2 = html2
    .replace(/(?:<p>(?:\s|<br\s*\/?>)*<\/p>\s*){2,}/gi, '<p><br></p>')
    .replace(/(?:\s*<p>(?:\s|<br\s*\/?>)*<\/p>)+$/gi, '')
    .trim();
  return html2;
}

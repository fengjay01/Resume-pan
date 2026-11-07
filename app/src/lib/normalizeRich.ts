/**
 * 渲染前规范化富文本（不改动用户存储的数据，仅影响渲染结果）：
 * 只处理一种情况——**段落仅由「短标签」构成**（去空白后 ≤ 12 字、以冒号结尾），
 * 说明它是粘贴/加粗产生的「标签独占一行」，应与其后的内容连排：
 *   - `<p><strong>项目成果：</strong></p><p>①完成…</p>` → 合并为一段；
 *   - `<p><strong>项目成果：</strong><br>①完成…</p>` → 删掉 <br>。
 *
 * 注：带内容的行（如「研究方向：计算机视觉、具身智能」「创新基金：《…》」）**不会**被合并，
 * 用户有意的多行/缩进结构原样保留——与参考稿（小林简历）行为一致。
 */
export function normalizeRichHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  try {
    return normalizeInner(html);
  } catch {
    // 任何异常都回退原样，绝不让渲染受影响
    return html;
  }
}

function normalizeInner(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  /** 段落是否「仅由短标签构成」：去空白后 ≤ 12 字且以中/英文冒号结尾（「：」后无任何内容） */
  const isLabelOnly = (text: string) => {
    const t = (text || '').replace(/\s+/g, '');
    return t.length > 0 && t.length <= 12 && /[：:]$/.test(t);
  };

  // 1) 段内「纯标签 + 换行 + 内容」：删掉标签后的**全部**换行（含连续 <br>，清掉多余空行）
  body.querySelectorAll('p, li, div').forEach((el) => {
    // 注意：删除后续 br 会使快照里其它 br 脱离文档，遍历时必须先校验 parentNode
    Array.from(el.querySelectorAll('br')).forEach((br) => {
      if (!br.parentNode || !el.contains(br)) return;
      // 该 br 之前（同一元素内）的文本
      const range = doc.createRange();
      range.setStart(el, 0);
      range.setEndBefore(br);
      const before = range.toString();
      // 该 br 之后（同一元素内）的文本
      const r2 = doc.createRange();
      r2.setStartAfter(br);
      r2.setEnd(el, el.childNodes.length);
      const after = r2.toString();
      if (!isLabelOnly(before) || !after.trim()) return;

      // 删除这个 br 及其后连续的 <br> / 纯空白文本节点
      let node: Node | null = br.nextSibling;
      while (node) {
        const isBr = node.nodeType === 1 && (node as Element).tagName.toUpperCase() === 'BR';
        const isBlank = node.nodeType === 3 && !(node.textContent || '').trim();
        if (!isBr && !isBlank) break;
        const nextNode: Node | null = node.nextSibling;
        node.parentNode?.removeChild(node);
        node = nextNode;
      }
      br.remove();
    });
  });

  // 2) 「纯标签」独占一段：与后面的内容段合并（中间可夹多余的 <br> / 空段）
  Array.from(body.children).forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (tag !== 'P' && tag !== 'DIV') return;
    if (!isLabelOnly(el.textContent || '')) return;

    const skipped: Element[] = [];
    let next: Element | null = el.nextElementSibling;
    let target: Element | null = null;
    while (next) {
      const t = next.tagName.toUpperCase();
      if (t === 'BR' || ((t === 'P' || t === 'DIV') && !(next.textContent || '').trim())) {
        skipped.push(next);
        next = next.nextElementSibling;
        continue;
      }
      target = /^(P|DIV)$/.test(t) && (next.textContent || '').trim() ? next : null;
      break;
    }
    if (!target) return;

    while (target.firstChild) el.appendChild(target.firstChild);
    target.remove();
    skipped.forEach((n) => n.remove());
  });

  return body.innerHTML;
}

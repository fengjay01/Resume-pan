import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  IndentDecrease,
  IndentIncrease,
  Info,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { normalizeRichHtml } from '@/lib/normalizeRich';
import { escapeHtml, markdownToHtml, sanitizePastedHtml } from '@/lib/richText';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 编辑区最小高度（px） */
  minHeight?: number;
  className?: string;
}

type Command = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'indent' | 'outdent';

const TOOLS: { cmd?: Command; icon: typeof Bold; title: string }[] = [
  { cmd: 'bold', icon: Bold, title: '粗体 (Ctrl+B)' },
  { cmd: 'italic', icon: Italic, title: '斜体 (Ctrl+I)' },
  { cmd: 'insertUnorderedList', icon: List, title: '无序列表' },
  { cmd: 'insertOrderedList', icon: ListOrdered, title: '有序列表' },
  { cmd: 'indent', icon: IndentIncrease, title: '增加缩进' },
  { cmd: 'outdent', icon: IndentDecrease, title: '减少缩进' },
];

/** 一条撤销记录：内容 + 当时的光标位置（撤销时恢复） */
interface HistoryEntry {
  html: string;
  sel: Range | null;
}

/** 粘贴的 HTML 里是否含块级元素 */
const hasBlockTag = (html: string) => /<(p|div|ul|ol|table|h[1-6]|blockquote)[\s>/]/i.test(html);

/**
 * 整段内容是否是「单个块级元素 + 纯行内内容」——是则返回剥壳后的行内 HTML，
 * 否则返回 null。用于把 `<p>一句话</p>` 这类粘贴降级为行内插入，
 * 避免在段落 / 列表项中间插入时被浏览器折成换行。
 */
function unwrapSingleBlock(html: string): string | null {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const nodes = Array.from(tpl.content.childNodes).filter(
    (n) => n.nodeType !== 3 || !!(n.textContent || '').trim(),
  );
  if (nodes.length !== 1 || nodes[0].nodeType !== 1) return null;
  const el = nodes[0] as HTMLElement;
  if (!/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(el.tagName)) return null;
  // 内部不能再有块级/列表/表格，否则那是真正的分段内容
  if (el.querySelector('p, div, ul, ol, li, table, h1, h2, h3, h4, h5, h6, blockquote, hr, br')) {
    return null;
  }
  return el.innerHTML;
}

/**
 * 轻量富文本编辑器（contentEditable + 原生 execCommand + 自建撤销栈）。
 *
 * 说明：`document.execCommand` 已被标记为废弃，但主流浏览器仍然可用，
 * 且它是本项目「不引入第三方富文本依赖」前提下最直接可行的方案。
 *
 * **自建撤销栈的原因**：粘贴等操作需要手动整理 DOM（如把列表从光标处拆开），
 * 这类操作不在浏览器的原生撤销栈里；而 blur 时规范化、外部 value 同步等
 * innerHTML 重写又会清空原生撤销栈。所以 Ctrl+Z / Ctrl+Y 由自己管理：
 * 每次编辑保存「内容 + 光标快照」，撤销时一并恢复。
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 92,
  className,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tipOpen, setTipOpen] = useState(false);

  /* ---------------------------------- 撤销栈 ---------------------------------- */
  /** history[0] 是初始内容；hIndex 指向「当前」状态，undo = hIndex-1，redo = hIndex+1 */
  const history = useRef<HistoryEntry[]>([]);
  const hIndex = useRef(0);
  /** 上一次入栈时间：500ms 内的连续编辑合并为一步（打字不会一字一退） */
  const lastPushAt = useRef(0);
  /** 正在应用历史（undo/redo）：期间的 onChange 不再入栈 */
  const applying = useRef(false);

  const currentRange = (): Range | null => {
    const sel = window.getSelection();
    return sel && sel.rangeCount && ref.current?.contains(sel.getRangeAt(0).commonAncestorContainer)
      ? sel.getRangeAt(0).cloneRange()
      : null;
  };

  const pushHistory = useCallback((html: string, replaceTop = false) => {
    const entry: HistoryEntry = { html, sel: currentRange() };
    const now = Date.now();
    if (replaceTop && history.current.length) {
      history.current[hIndex.current] = entry;
    } else {
      // 丢弃「 redo 尾巴」并追加
      history.current = history.current.slice(0, hIndex.current + 1);
      history.current.push(entry);
      hIndex.current = history.current.length - 1;
      if (history.current.length > 120) history.current.shift();
      if (hIndex.current >= history.current.length) hIndex.current = history.current.length - 1;
    }
    lastPushAt.current = now;
  }, []);

  /** 应用一条历史记录：重写内容并恢复当时的光标 */
  const applyHistory = useCallback(
    (index: number) => {
      const el = ref.current;
      const entry = history.current[index];
      if (!el || !entry) return;
      applying.current = true;
      el.innerHTML = entry.html;
      hIndex.current = index;
      el.focus();
      if (entry.sel && el.contains(entry.sel.startContainer)) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(entry.sel);
        }
      }
      onChange(entry.html);
      applying.current = false;
    },
    [onChange],
  );

  const undo = useCallback(() => {
    if (hIndex.current <= 0) return;
    applyHistory(hIndex.current - 1);
  }, [applyHistory]);

  const redo = useCallback(() => {
    if (hIndex.current >= history.current.length - 1) return;
    applyHistory(hIndex.current + 1);
  }, [applyHistory]);

  // 受控同步：仅当外部 value 与 DOM 当前内容不一致时才写回（外部变更，如切换模块），
  // 同时重置撤销栈 —— 撤销历史只对「当前这份内容」有意义
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value ?? '';
      history.current = [{ html: value ?? '', sel: null }];
      hIndex.current = 0;
    }
  }, [value]);

  /** 当前光标是否在某个 <li> 里 */
  const caretList = (): HTMLLIElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const start = sel.getRangeAt(0).startContainer;
    const el = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement;
    return (el?.closest('li') as HTMLLIElement) ?? null;
  };

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 打字 / 命令的连续编辑合并为一步；超过 500ms 或显式要求时另起一步
    pushHistory(el.innerHTML, Date.now() - lastPushAt.current < 500);
    onChange(el.innerHTML);
  }, [onChange, pushHistory]);

  const exec = useCallback(
    (cmd: Command) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      // eslint-disable-next-line deprecation/deprecation
      document.execCommand(cmd);
      emit();
    },
    [emit],
  );

  /** 失焦时合并「纯标签独占行」（≤12 字冒号结尾 + 内容另起）：
   *  模拟用户从 Word 粘贴时留下的「标签独占一行」，与内容连排；
   *  带内容的多行结构（如「研究方向：计算机视觉」）不会被动到。 */
  const handleBlur = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const normalized = normalizeRichHtml(el.innerHTML);
    if (normalized !== el.innerHTML) {
      el.innerHTML = normalized;
      pushHistory(normalized, false);
      onChange(normalized);
    } else {
      onChange(el.innerHTML);
    }
  }, [onChange, pushHistory]);

  /** 原生 focusout 监听（双保险：不依赖 React 合成事件） */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('focusout', handleBlur);
    return () => el.removeEventListener('focusout', handleBlur);
  }, [handleBlur]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      exec('bold');
    } else if (key === 'i') {
      e.preventDefault();
      exec('italic');
    } else if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      redo();
    }
  };

  /**
   * 粘贴处理：
   * - 纯文本 → 极简 Markdown 解析；
   * - 带 HTML（Word / 网页）→ **保留版式结构**（加粗/斜体/列表/缩进/对齐/表格），
   *   只剥离字体、字号、颜色等字体类样式，使其自动跟随模板排版。
   *
   * 插入位置一律跟随光标：
   * - 常规情况用 `execCommand('insertHTML')`（浏览器原生插入，可撤销）；
   * - 光标在列表项里且粘贴的是多段块级内容时，浏览器会把整块塞进这个 <li> 里
   *   （列表项里再套段落，结构就乱了）—— 这里手动把 <li> 从光标处拆开，
   *   把内容插到两段之间，结构才正确；插入后整体走自建撤销栈。
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    (window as unknown as Record<string, unknown>).__pasteHit =
      ((window as unknown as Record<string, unknown>).__pasteHit as number ?? 0) + 1;
    const clipboard = e.clipboardData;
    if (!clipboard) return;
    const pastedHtml = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');
    if (!pastedHtml && !text) return;
    e.preventDefault();
    let converted: string;
    if (pastedHtml) {
      converted = sanitizePastedHtml(pastedHtml);
      // 清洗后为空（比如只复制了纯装饰内容）则退回纯文本
      if (!converted.trim()) converted = escapeHtml(text);
    } else {
      converted = markdownToHtml(text);
    }

    const sel = window.getSelection();

    /* 非折叠选区（含全选）：粘贴 = **替换**选区。
     * - 选区完全在同一个 <li> 内：删掉选区内容、光标折叠后继续走常规流程；
     * - 选区跨块（如全选整份简历）：交给浏览器原生 insertHTML 替换 ——
     *   手动「拆 li」只对折叠光标有意义，跨块时只删光标之后的内容会留下选区前段残骸。 */
    if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
      const range = sel.getRangeAt(0);
      const elOf = (n: Node) => (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement);
      const startLi = elOf(range.startContainer)?.closest('li');
      const endLi = elOf(range.endContainer)?.closest('li');
      if (startLi && startLi === endLi) {
        range.deleteContents();
        const r = document.createRange();
        r.setStart(range.startContainer, range.startOffset);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        // eslint-disable-next-line deprecation/deprecation
        document.execCommand('insertHTML', false, converted);
        emit();
        return;
      }
    }

    const li = sel && sel.rangeCount ? caretList() : null;
    (window as unknown as Record<string, unknown>).__pasteDbg = {
      collapsed: sel ? sel.getRangeAt(0).collapsed : null,
      liTag: li ? li.tagName : null,
      liText: li ? li.textContent?.slice(0, 10) : null,
      liConnected: li ? li.isConnected : null,
      liLeft: li ? Math.round(li.getBoundingClientRect().left) : null,
      block: hasBlockTag(converted),
      converted: converted.slice(0, 30),
    };

    /* 光标在文字流里（段落 / 列表项 / 标题）且粘贴的是「单个块级元素」：
     * 剥掉块级壳，只取行内内容插入。
     * 否则浏览器会把 <p> 折成换行 —— 在列表项里表现就是「一粘贴就多出一行」。
     * 多段内容不走这条（那是用户明确要分段，走下面的拆 li 逻辑）。 */
    const inTextFlow =
      !!sel &&
      !!sel.rangeCount &&
      (() => {
        const start = sel.getRangeAt(0).startContainer;
        const el = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement;
        return !!el?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote');
      })();
    if (inTextFlow) {
      const inner = unwrapSingleBlock(converted);
      if (inner !== null) converted = inner;
    }

    // 光标在列表项里 + 粘贴的是块级内容 → 拆 li 后插到中间
    if (li && sel && sel.rangeCount && hasBlockTag(converted)) {
      const range = sel.getRangeAt(0);
      // 光标之后、li 末尾的内容 → 挪到新 li
      const afterRange = document.createRange();
      afterRange.setStart(range.startContainer, range.startOffset);
      afterRange.setEnd(li, li.childNodes.length);
      const tail = afterRange.extractContents();

      const tpl = document.createElement('template');
      tpl.innerHTML = converted;
      // 顶层块级节点转成 <li>：保持「ul 的孩子只能是 li」的合法结构，
      // 粘贴多个段落的实际效果 = 变成多个新列表项（与 Word 行为一致）
      const nodes = Array.from(tpl.content.childNodes)
        .filter((n) => n.nodeType === 1 || (n.nodeType === 3 && !!(n.textContent || '').trim()))
        .map((n) => {
          if (n.nodeType === 1 && /^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test((n as HTMLElement).tagName)) {
            const asLi = document.createElement('li');
            while (n.firstChild) asLi.appendChild(n.firstChild);
            return asLi;
          }
          return n;
        });

      const tailIsEmpty = !tail.textContent?.trim() && !tail.querySelector('ul, ol, img');
      const newLi = document.createElement(li.tagName);
      newLi.appendChild(tail);

      if (tailIsEmpty) {
        // 先插入内容，再移除原列表项——
        // 顺序反了（先 remove 再 after）时 li 已脱离文档，after() 无处可插，粘贴内容会整段丢失
        const dropLi = !li.textContent?.trim() && !li.querySelector('img, ul, ol');
        li.after(...nodes);
        if (dropLi) li.remove();
      } else {
        li.after(...nodes, newLi);
      }

      // 光标落到插入内容的开头，方便继续编辑
      const first = nodes[0] ?? newLi;
      const r = document.createRange();
      r.setStartBefore(first);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      emit();
      return;
    }

    // eslint-disable-next-line deprecation/deprecation
    document.execCommand('insertHTML', false, converted);
    emit();
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-ink-200 bg-white', className)}>
      <div
        className="flex items-center gap-1 border-b border-ink-100 bg-ink-50 px-2 py-1.5"
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* 撤销 / 恢复：走自建撤销栈 */}
        <button
          type="button"
          title="撤销 (Ctrl+Z)"
          aria-label="撤销"
          onClick={undo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-600 transition hover:bg-white hover:text-brand-700 hover:shadow-sm"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          title="恢复 (Ctrl+Y)"
          aria-label="恢复"
          onClick={redo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-600 transition hover:bg-white hover:text-brand-700 hover:shadow-sm"
        >
          <Redo2 size={15} />
        </button>
        {TOOLS.map(({ cmd, icon: Icon, title }) => (
          <button
            key={title}
            type="button"
            title={title}
            aria-label={title}
            onClick={() => cmd && exec(cmd)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-600 transition hover:bg-white hover:text-brand-700 hover:shadow-sm"
          >
            <Icon size={15} />
          </button>
        ))}
        <div className="relative ml-auto">
          <button
            type="button"
            title="支持 Markdown 语法粘贴"
            aria-label="Markdown 语法提示"
            onClick={() => setTipOpen((v) => !v)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white hover:text-brand-700 hover:shadow-sm',
              tipOpen ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-400',
            )}
          >
            <Info size={15} />
          </button>
          {tipOpen && (
            <div className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-ink-100 bg-white p-3 text-xs leading-relaxed text-ink-600 shadow-float">
              支持 Markdown 语法粘贴：<code className="rounded bg-ink-100 px-1">- 列表</code>、
              <code className="rounded bg-ink-100 px-1">1. 有序列表</code>、
              <code className="rounded bg-ink-100 px-1">**加粗**</code>、
              <code className="rounded bg-ink-100 px-1">*斜体*</code>。
              粘贴纯文本时会自动转换。
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        className="rich-editor px-3 py-2.5"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </div>
  );
}

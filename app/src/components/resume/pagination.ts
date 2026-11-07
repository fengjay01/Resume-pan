import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * 两趟渲染中的「第一趟」：离屏量测。
 * 每次渲染后读取量测容器各子块真实高度，带容差比较避免 setState 造成死循环
 * （React StrictMode 下 effect 会执行两次，逻辑幂等）。
 */
export function useBlockHeights(measureRef: RefObject<HTMLDivElement | null>, blockCount: number) {
  const [heights, setHeights] = useState<number[] | null>(null);
  // 自定义字体异步加载完成后触发一次重量测
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts && typeof fonts.ready?.then === 'function') {
      void fonts.ready.then(() => {
        if (alive) setEpoch((e) => e + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    void epoch;
    const el = measureRef.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (kids.length !== blockCount) return;

    // 渲染器可能被放在带 `transform: scale(s)` 的祖先内（编辑器预览缩放 / 缩略图等比缩放），
    // 此时 getBoundingClientRect() 返回的是被缩放后的可视尺寸，而 contentHeight 是未缩放常量，
    // 两者坐标系不一致会导致分页容量错配。这里用「量测容器可视宽度 / 布局宽度(offsetWidth)」还原
    // 祖先缩放比，把每个块换算回未缩放的布局高度后再参与装箱。
    const layoutWidth = el.offsetWidth;
    const visualWidth = el.getBoundingClientRect().width;
    const scale = layoutWidth > 0 && visualWidth > 0 ? visualWidth / layoutWidth : 1;

    const next = kids.map((k) => {
      const visualHeight = k.getBoundingClientRect().height;
      // 无缩放祖先时 scale≈1，等价于直接用可视高度；有缩放时除以 scale 还原布局高度
      return scale > 0 ? visualHeight / scale : k.offsetHeight;
    });

    setHeights((prev) => {
      if (
        prev &&
        prev.length === next.length &&
        prev.every((h, i) => Math.abs(h - next[i]) < 0.5)
      ) {
        return prev;
      }
      return next;
    });
  });

  return heights;
}

/** 参与装箱的块：高度 + 页内上边距 */
export interface PageBlock {
  height: number;
  /** 该块不是页面首块时的上边距（px）：章节之间为 sectionGap，章节内条目为 0 */
  gapBefore: number;
}

/**
 * 「第二趟」：贪心装箱。返回每页包含的块下标数组。
 *
 * - 页内块间使用各自的 `gapBefore`（条目间距由条目自身的外边距提供，故条目间为 0）；
 * - 单块高度超过页容量时独占一页（允许溢出由纸张裁切）。
 *
 * 之所以要「拆块」：调用方会把条目式模块拆成「标题 + 第 1 条」「第 2 条」「第 3 条」…
 * 多个原子块。否则一个长模块（如包含多条长描述的项目经历）整块放不下时会被
 * 整体推到下一页，导致上一页大面积留白。
 */
export function paginate(blocks: PageBlock[], contentHeight: number): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;

  blocks.forEach((b, i) => {
    const gap = current.length > 0 ? b.gapBefore : 0;
    if (current.length > 0 && used + gap + b.height > contentHeight + 0.5) {
      pages.push(current);
      current = [i];
      used = b.height;
    } else {
      current.push(i);
      used += gap + b.height;
    }
  });

  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  return pages;
}

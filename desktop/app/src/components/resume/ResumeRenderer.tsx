import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { A4_HEIGHT, A4_WIDTH } from '@/data/design';
import { getTemplate } from '@/data/templates';
import type { Resume } from '@/types/resume';
import { paginate, useBlockHeights } from './pagination';
import { buildBlocks } from './parts';
import { buildTokens } from './tokens';

export interface ResumeRendererProps {
  resume: Resume;
  className?: string;
  /** 是否渲染真实 A4 纸张阴影（缩略图场景可关闭） */
  withShadow?: boolean;
}

/** 纸张样式：宽 794、高 1123，白底、裁切；页内边距取 spacing */
function pageStyle(tokens: ReturnType<typeof buildTokens>, withShadow: boolean): CSSProperties {
  return {
    position: 'relative',
    width: A4_WIDTH,
    height: A4_HEIGHT,
    boxSizing: 'border-box',
    background: '#ffffff',
    overflow: 'hidden',
    paddingTop: tokens.marginTop,
    paddingRight: tokens.marginX,
    paddingBottom: tokens.marginBottom,
    paddingLeft: tokens.marginX,
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fs,
    lineHeight: tokens.lineHeight,
    // 正文常规字重（400）：加粗由用户在编辑器自行控制（bold 按钮粘贴语义加粗）
    color: '#000000',
    boxShadow: withShadow
      ? '0 1px 2px rgba(16,24,40,.06), 0 6px 24px rgba(16,24,40,.10)'
      : undefined,
  };
}

/**
 * 简历渲染引擎。
 * 两趟渲染：先在离屏容器量测「头部 + 各章节」原子块高度，再贪心装箱分页；
 * 根节点带 `data-page-count` 供编辑器读取页数。
 */
export function ResumeRenderer({ resume, className, withShadow }: ResumeRendererProps) {
  const shadow = withShadow !== false;

  const tokens = useMemo(() => buildTokens(resume.style), [resume.style]);
  const blocks = useMemo(() => buildBlocks(resume, tokens), [resume, tokens]);
  /** 模板级页面装饰（如「图标线条」版式的顶部通栏色条） */
  const topBar = getTemplate(resume.style.templateId).topBar === true;

  const contentWidth = A4_WIDTH - tokens.marginX * 2;
  const contentHeight = A4_HEIGHT - tokens.marginTop - tokens.marginBottom;

  const measureRef = useRef<HTMLDivElement | null>(null);
  const heights = useBlockHeights(measureRef, blocks.length);

  const pages = useMemo<number[][] | null>(() => {
    if (!heights || heights.length !== blocks.length) return null;
    return paginate(
      blocks.map((b, i) => ({ height: heights[i], gapBefore: b.gapBefore })),
      contentHeight,
    );
  }, [heights, blocks, contentHeight]);

  const pageCount = pages ? pages.length : 1;

  const measureTextStyle: CSSProperties = {
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fs,
    lineHeight: tokens.lineHeight,
    color: '#000000',
  };

  // 页内块包装：flow-root 阻止外边距塌陷，保证量测高度与真实渲染一致；
  // 上边距取块自带的 gapBefore（章节间 = sectionGap，章节内条目 = 0）
  const blockStyle = (indexInPage: number, gapBefore: number): CSSProperties => ({
    display: 'flow-root',
    marginTop: indexInPage === 0 ? 0 : gapBefore,
  });

  // 模板顶部通栏色条（对照参考稿「图标线条」版式：页面最顶端一条全宽主题色横带）
  const topBarNode = topBar ? (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 8,
        background: tokens.primary,
      }}
    />
  ) : null;

  return (
    <div className={className} data-page-count={pageCount}>
      {/* 第一趟：离屏量测容器（宽度与样式和正式渲染完全一致）
          外层 0×0 + overflow:hidden 保证离屏内容不影响滚动区域；内层尺寸仍可被精确量测 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div ref={measureRef} style={{ width: contentWidth, ...measureTextStyle }}>
          {blocks.map((b) => (
            <div key={b.key} style={{ display: 'flow-root' }}>
              {b.node}
            </div>
          ))}
        </div>
      </div>

      {/* 第二趟：分页渲染；量测未完成时先渲染单页兜底 */}
      {pages
        ? pages.map((page, pi) => (
            <div key={pi} className="resume-page" style={pageStyle(tokens, shadow)}>
              {topBarNode}
              {page.map((bi, idx) => (
                <div key={blocks[bi].key} style={blockStyle(idx, blocks[bi].gapBefore)}>
                  {blocks[bi].node}
                </div>
              ))}
            </div>
          ))
        : (
            <div className="resume-page" style={pageStyle(tokens, shadow)}>
              {topBarNode}
              {blocks.map((b, idx) => (
                <div key={b.key} style={blockStyle(idx, b.gapBefore)}>
                  {b.node}
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, PenLine, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { ResumeRenderer } from '@/components/resume';
import { A4_HEIGHT, A4_WIDTH } from '@/data/design';
import { getTemplate } from '@/data/templates';
import { cn } from '@/lib/cn';
import { isSectionVisible } from '@/lib/resume';
import type { Resume } from '@/types/resume';
import { PREVIEW_BG, ZOOM_PRESETS } from './editorOptions';

export interface PreviewHandle {
  /** 读取当前预览的页数 */
  measurePageCount: () => number;
}

interface PreviewPaneProps {
  resume: Resume;
  pageCount: number;
  onPageCountChange: (n: number) => void;
  compressing: boolean;
  onSmartOnePage: () => void;
  /** 下方编辑面板状态：收起/展开按钮放进缩放工具条（避免与模块悬停浮层重叠） */
  panelCollapsed?: boolean;
  onTogglePanel?: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const PAD = 24;
/** 打开简历时的默认缩放（产品约定固定 80%） */
const DEFAULT_ZOOM = 0.8;

export const PreviewPane = forwardRef<PreviewHandle, PreviewPaneProps>(function PreviewPane(
  { resume, pageCount, onPageCountChange, compressing, onSmartOnePage, panelCollapsed, onTogglePanel },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scaleWrapRef = useRef<HTMLDivElement | null>(null);
  const lastReported = useRef(0);

  // 默认 80%（产品约定），不再按视口自适应；用户可用缩放工具条手动调整
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT);
  const [smartTop, setSmartTop] = useState(A4_HEIGHT + 28);

  const measurePageCount = useCallback(() => {
    const wrap = scaleWrapRef.current;
    if (!wrap) return 0;
    const attr = wrap.getAttribute('data-page-count');
    const fromAttr = attr ? Number(attr) : NaN;
    if (Number.isFinite(fromAttr) && fromAttr > 0) return fromAttr;
    return Math.max(1, wrap.querySelectorAll('.resume-page').length);
  }, []);

  useImperativeHandle(ref, () => ({ measurePageCount }), [measurePageCount]);

  /** 重新测量内容高度 / 页数 / 智能一页按钮的纵向位置 */
  const refresh = useCallback(() => {
    const wrap = scaleWrapRef.current;
    if (!wrap) return;
    const count = measurePageCount();
    if (count !== lastReported.current) {
      lastReported.current = count;
      onPageCountChange(count);
    }
    setContentHeight(Math.max(A4_HEIGHT, wrap.scrollHeight));

    const pages = wrap.querySelectorAll<HTMLElement>('.resume-page');
    if (pages.length > 1) {
      const wrapRect = wrap.getBoundingClientRect();
      const first = pages[0].getBoundingClientRect();
      const second = pages[1].getBoundingClientRect();
      setSmartTop(((first.bottom + second.top) / 2 - wrapRect.top) / zoom);
    } else {
      setSmartTop(A4_HEIGHT + 28);
    }
  }, [measurePageCount, onPageCountChange, zoom]);

  // 简历变化后重新测量
  useEffect(() => {
    refresh();
  }, [resume, refresh]);

  // 渲染引擎重新分页时（高度变化）同步测量
  useEffect(() => {
    const wrap = scaleWrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => refresh());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [refresh]);

  const applyZoom = (next: number) => {
    setZoom(Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)).toFixed(2)));
  };

  const zoomPct = Math.round(zoom * 100);

  // 简历还是空的时候，预览区给一层引导，避免「一张空白纸」看起来像坏了
  const isEmpty = !resume.basic.name && !resume.sections.some(isSectionVisible);
  const currentTemplate = getTemplate(resume.style.templateId);

  return (
    <div className="relative flex-1 overflow-hidden" style={{ background: PREVIEW_BG }}>
      <div ref={scrollRef} className="relative h-full w-full overflow-auto">
        <div className="flex justify-center" style={{ padding: PAD }}>
          <div
            className="relative"
            style={{ width: A4_WIDTH * zoom, height: contentHeight * zoom, flex: 'none' }}
          >
            <div
              ref={scaleWrapRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: A4_WIDTH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <ResumeRenderer resume={resume} withShadow />
            </div>

            {pageCount > 1 && (
              <button
                type="button"
                disabled={compressing}
                onClick={onSmartOnePage}
                style={{ left: '50%', top: smartTop * zoom }}
                className={cn(
                  'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium shadow-float transition hover:shadow-lg',
                  compressing ? 'cursor-wait text-ink-500' : 'text-brand-700 hover:bg-brand-50',
                )}
              >
                {compressing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {compressing ? '压缩中...' : '智能一页'}
              </button>
            )}

            {isEmpty && (
              <div
                className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center"
                style={{ top: (A4_HEIGHT / 2) * zoom, width: Math.min(440, A4_WIDTH * zoom - 48) }}
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <PenLine size={20} />
                </div>
                <p className="mt-3 text-[15px] font-semibold text-ink-700">开始填写你的简历</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">
                  在下方依次填写基本信息与各模块内容，会自动排版到这张纸上。
                  <br />
                  不需要的模块，可用上方步骤导航里的开关隐藏。
                </p>
                <p className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-white/95 px-3 py-1 text-[12px] text-ink-500 shadow-sm">
                  当前风格：{currentTemplate.styleName}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-3">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1.5 shadow-float">
          <button
            type="button"
            title="缩小"
            aria-label="缩小"
            onClick={() => applyZoom(zoom - 0.1)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-600 transition hover:bg-ink-100"
          >
            <ZoomOut size={15} />
          </button>
          <span className="pl-1 text-[12px] text-ink-500">缩放</span>
          <select
            value={String(zoom)}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-6 min-w-[54px] rounded-md border border-ink-200 bg-white px-1 text-center text-[12px] tabular-nums text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          >
            {(ZOOM_PRESETS.includes(zoom) ? ZOOM_PRESETS : [...ZOOM_PRESETS, zoom]).map(
              (preset) => (
                <option key={preset} value={String(preset)}>
                  {Math.round(preset * 100)}%
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            title="放大"
            aria-label="放大"
            onClick={() => applyZoom(zoom + 0.1)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-600 transition hover:bg-ink-100"
          >
            <ZoomIn size={15} />
          </button>

          {/* 打开 / 关闭下方编辑面板：放进缩放工具条，不与模块悬停浮层抢占位置 */}
          {onTogglePanel && (
            <>
              <span className="mx-0.5 h-4 w-px bg-ink-200" />
              <button
                type="button"
                title={panelCollapsed ? '展开编辑面板' : '收起编辑面板'}
                aria-label={panelCollapsed ? '展开编辑面板' : '收起编辑面板'}
                onClick={onTogglePanel}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-600 transition hover:bg-ink-100"
              >
                {panelCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

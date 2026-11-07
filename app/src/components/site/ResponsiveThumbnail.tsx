import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ResumeThumbnail } from '@/components/resume';
import type { Resume } from '@/types/resume';

/**
 * 让 ResumeThumbnail 随容器宽度自适应：测量容器宽度后按像素传入 width。
 * 未测量前用 A4 比例占位，避免布局跳动。
 */
export function ResponsiveThumbnail({
  resume,
  className,
}: {
  resume: Resume;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: '794 / 1123' }}
    >
      {width > 0 && <ResumeThumbnail resume={resume} width={width} />}
    </div>
  );
}

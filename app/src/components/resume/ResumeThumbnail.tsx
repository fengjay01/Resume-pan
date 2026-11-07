import { A4_HEIGHT, A4_WIDTH } from '@/data/design';
import type { Resume } from '@/types/resume';
import { ResumeRenderer } from './ResumeRenderer';

export interface ResumeThumbnailProps {
  resume: Resume;
  /** 缩略图宽度（px），高度按 A4 比例自动计算 */
  width?: number;
  className?: string;
}

/**
 * 简历缩略图：按 width 等比缩放渲染简历首页，超出部分裁切。
 * 内层用 transform 缩放真实渲染结果，保证与预览/导出完全一致。
 */
export function ResumeThumbnail({ resume, width = 200, className }: ResumeThumbnailProps) {
  const scale = width / A4_WIDTH;
  return (
    <div
      className={className}
      style={{
        width,
        height: (width * A4_HEIGHT) / A4_WIDTH,
        overflow: 'hidden',
        background: '#ffffff',
        position: 'relative',
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: A4_WIDTH }}>
        <ResumeRenderer resume={resume} withShadow={false} />
      </div>
    </div>
  );
}

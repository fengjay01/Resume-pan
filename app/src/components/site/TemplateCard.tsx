import { Eye, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tag } from '@/components/common/Misc';
import { Button } from '@/components/common/Button';
import type { TemplateMeta } from '@/types/resume';
import { previewResume } from './preview';
import { ResponsiveThumbnail } from './ResponsiveThumbnail';

export function TemplateCard({
  template,
  onPreview,
  onUse,
  className,
}: {
  template: TemplateMeta;
  onPreview: (tpl: TemplateMeta) => void;
  onUse: (tpl: TemplateMeta) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
    >
      <div
        className="relative cursor-pointer overflow-hidden border-b border-ink-100 bg-ink-50"
        onClick={() => onPreview(template)}
      >
        <ResponsiveThumbnail resume={previewResume(template.id)} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-ink-900/45 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto border-white/70 bg-white/95 hover:border-white hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(template);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            预览模板
          </Button>
          <Button
            size="sm"
            className="pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              onUse(template);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            使用模板
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-[15px] font-semibold leading-snug text-ink-900">{template.name}</h3>
        <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-500">
          {template.description}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {template.tags.slice(0, 4).map((t) => (
            <Tag key={t} className="bg-ink-100 text-[11px] text-ink-500">
              {t}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
}

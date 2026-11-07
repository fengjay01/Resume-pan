import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { ResumeRenderer } from '@/components/resume';
import type { TemplateMeta } from '@/types/resume';
import { previewResume } from './preview';

export function TemplatePreviewModal({
  template,
  open,
  onClose,
  onUse,
}: {
  template: TemplateMeta | null;
  open: boolean;
  onClose: () => void;
  onUse: (tpl: TemplateMeta) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.9);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (box) {
      const w = box.clientWidth;
      if (w > 0) setScale(Math.min(0.95, w / 794));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentHeight(el.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, template?.id]);

  const resume = template ? previewResume(template.id) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={900}
      title={template ? `模板预览 · ${template.name}` : '模板预览'}
      bodyClassName="max-h-[80vh] overflow-y-auto bg-ink-100/70"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => template && onUse(template)}>
            <Sparkles className="h-4 w-4" />
            使用该模板
          </Button>
        </>
      }
    >
      {template && resume && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-card">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {template.styleName}
            </span>
            <span className="text-[13px] text-ink-500">{template.styleDesc}</span>
          </div>

          <div ref={boxRef} className="w-full">
            <div
              className="relative mx-auto"
              style={{ width: 794 * scale, height: contentHeight * scale || undefined }}
            >
              <div
                ref={contentRef}
                className="absolute left-0 top-0"
                style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                <ResumeRenderer resume={resume} withShadow />
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

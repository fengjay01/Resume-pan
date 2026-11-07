import { TEMPLATES, getTemplate } from '@/data/templates';
import { cn } from '@/lib/cn';
import type { Resume, TemplateMeta } from '@/types/resume';
import { CurrentTemplateInfo, PanelSection } from './fields';
import { TemplateWireframe } from './TemplateWireframe';

/** 按「风格」去重后的模板清单：同一风格只保留第一款代表模板（Map 会保留最后一个，故用 filter） */
const STYLES: TemplateMeta[] = TEMPLATES.filter(
  (t, i) => TEMPLATES.findIndex((x) => x.styleName === t.styleName) === i,
);

export function TemplatePanel({
  resume,
  onSwitch,
}: {
  resume: Resume;
  onSwitch: (templateId: string) => void;
}) {
  const current = getTemplate(resume.style.templateId);

  return (
    <div className="flex flex-col gap-5">
      <PanelSection title={`共 ${STYLES.length} 种风格`}>
        <div className="grid grid-cols-2 gap-2.5">
          {STYLES.map((template) => {
            const active = template.styleName === current.styleName;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSwitch(template.id)}
                title={`${template.styleName}：${template.styleDesc}`}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-2 transition',
                  active
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                    : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/30',
                )}
              >
                <span className="w-full overflow-hidden rounded-md border border-ink-100 bg-ink-50">
                  <TemplateWireframe template={template} className="block h-auto w-full" />
                </span>
                <span
                  className={cn(
                    'pb-0.5 text-[12.5px]',
                    active ? 'font-semibold text-brand-700' : 'text-ink-600',
                  )}
                >
                  {template.styleName}
                </span>
              </button>
            );
          })}
        </div>
      </PanelSection>

      <CurrentTemplateInfo name={current.styleName} desc={current.styleDesc} />
    </div>
  );
}

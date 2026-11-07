import { Check, Pipette } from 'lucide-react';
import { INFO_MODES, LAYOUTS, THEMES } from '@/data/design';
import { getTemplate } from '@/data/templates';
import { cn } from '@/lib/cn';
import type { ResumeStyle } from '@/types/resume';
import { ChoiceButton, CurrentTemplateInfo, PanelSection } from './fields';

export function StylePanel({
  style,
  onChange,
}: {
  style: ResumeStyle;
  onChange: (patch: Partial<ResumeStyle>) => void;
}) {
  const template = getTemplate(style.templateId);
  const customActive = !!style.themeCustom;

  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="主题色">
        <div className="flex flex-wrap gap-2.5">
          {THEMES.map((theme) => {
            const active = !customActive && style.theme === theme.key;
            return (
              <button
                key={theme.key}
                type="button"
                title={theme.label}
                aria-label={`主题色 ${theme.label}`}
                onClick={() => onChange({ theme: theme.key, themeCustom: undefined })}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition',
                  active ? 'ring-2 ring-offset-2 ring-brand-400' : 'hover:scale-105',
                )}
                style={{ backgroundColor: theme.primary }}
              >
                {active && <Check size={15} className="text-white" />}
              </button>
            );
          })}

          {/* 自定义调色：彩虹圆触发系统取色器，选中后整块显示自定义色 */}
          <button
            type="button"
            title="自定义颜色"
            aria-label="自定义颜色"
            onClick={() => {
              const input = document.getElementById(
                'theme-custom-color',
              ) as HTMLInputElement | null;
              input?.click();
            }}
            className={cn(
              'relative flex h-8 w-8 items-center justify-center rounded-full transition',
              customActive ? 'ring-2 ring-offset-2 ring-brand-400' : 'hover:scale-105',
            )}
            style={
              customActive
                ? { backgroundColor: style.themeCustom }
                : {
                    background:
                      'conic-gradient(#f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)',
                  }
            }
          >
            {customActive ? (
              <Check size={15} className="text-white drop-shadow" />
            ) : (
              <Pipette size={13} className="text-white drop-shadow" />
            )}
          </button>
          <input
            id="theme-custom-color"
            type="color"
            value={style.themeCustom ?? '#a855f7'}
            onChange={(e) => onChange({ themeCustom: e.target.value })}
            className="sr-only"
            aria-label="选择自定义主题色"
          />
        </div>
        {customActive && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
            当前自定义色
            <span
              className="inline-block h-3 w-3 rounded-full border border-ink-200"
              style={{ backgroundColor: style.themeCustom }}
            />
            <code className="rounded bg-ink-50 px-1">{style.themeCustom}</code>
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => onChange({ themeCustom: undefined })}
            >
              恢复预设
            </button>
          </p>
        )}
      </PanelSection>

      <PanelSection title="布局调整">
        <div className="flex gap-2">
          {LAYOUTS.map((layout) => (
            <ChoiceButton
              key={layout.key}
              active={style.layout === layout.key}
              onClick={() => onChange({ layout: layout.key })}
            >
              {layout.label}
            </ChoiceButton>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="信息展示">
        <div className="flex gap-2">
          {INFO_MODES.map((mode) => (
            <ChoiceButton
              key={mode.key}
              active={style.infoMode === mode.key}
              onClick={() => onChange({ infoMode: mode.key })}
            >
              {mode.label}
            </ChoiceButton>
          ))}
        </div>
      </PanelSection>

      <CurrentTemplateInfo name={template.styleName} desc={template.styleDesc} />
    </div>
  );
}

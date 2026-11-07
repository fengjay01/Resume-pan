import { RangeSlider } from '@/components/common/Form';
import { FONTS } from '@/data/design';
import { cn } from '@/lib/cn';
import type { ResumeStyle } from '@/types/resume';
import { FONT_SCALE_PRESETS } from './editorOptions';
import { ChoiceButton, PanelSection } from './fields';

const LANGUAGES: { key: ResumeStyle['language']; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
];

export function TextPanel({
  style,
  onChange,
}: {
  style: ResumeStyle;
  onChange: (patch: Partial<ResumeStyle>) => void;
}) {
  const scalePct = Math.round(style.fontScale * 100);

  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="简历语言">
        <div className="flex gap-2">
          {LANGUAGES.map((item) => (
            <ChoiceButton
              key={item.key}
              active={style.language === item.key}
              onClick={() => onChange({ language: item.key })}
            >
              {item.label}
            </ChoiceButton>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="字体">
        <div className="flex flex-col gap-2">
          {FONTS.map((font) => {
            const active = style.font === font.key;
            return (
              <button
                key={font.key}
                type="button"
                style={{ fontFamily: font.stack }}
                onClick={() => onChange({ font: font.key })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left text-[14px] transition',
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                )}
              >
                {font.label}
              </button>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="字号">
        <RangeSlider
          value={scalePct}
          min={80}
          max={115}
          onChange={(v) => onChange({ fontScale: v / 100 })}
          format={(v) => `${v}%`}
        />
        <div className="flex gap-2">
          {FONT_SCALE_PRESETS.map((preset) => (
            <ChoiceButton
              key={preset.label}
              active={Math.abs(style.fontScale - preset.value) < 0.001}
              onClick={() => onChange({ fontScale: preset.value })}
            >
              {preset.label}
            </ChoiceButton>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { RangeSlider } from '@/components/common/Form';
import { DEFAULT_SPACING } from '@/data/design';
import type { SpacingConfig } from '@/types/resume';
import { PanelSection } from './fields';

export function SpacingPanel({
  spacing,
  onChange,
}: {
  spacing: SpacingConfig;
  onChange: (patch: Partial<SpacingConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="模块上下间距">
        <RangeSlider
          value={spacing.sectionGap}
          min={0}
          max={64}
          step={0.01}
          onChange={(v) => onChange({ sectionGap: v })}
        />
        <HintRow left="紧凑" right="宽松" />
      </PanelSection>

      <PanelSection title="行间距">
        <RangeSlider
          value={spacing.lineHeight}
          min={1}
          max={2.6}
          step={0.01}
          onChange={(v) => onChange({ lineHeight: v })}
          format={(v) => v.toFixed(2)}
        />
        <HintRow left="紧凑" right="宽松" />
      </PanelSection>

      <PanelSection title="左右边距">
        <RangeSlider
          value={spacing.marginX}
          min={8}
          max={100}
          step={0.01}
          onChange={(v) => onChange({ marginX: v })}
        />
        <HintRow left="窄" right="宽" />
      </PanelSection>

      <PanelSection title="上边距">
        <RangeSlider
          value={spacing.marginTop}
          min={0}
          max={120}
          step={0.01}
          onChange={(v) => onChange({ marginTop: v })}
        />
        <HintRow left="窄" right="宽" />
      </PanelSection>

      <PanelSection title="下边距">
        <RangeSlider
          value={spacing.marginBottom}
          min={0}
          max={120}
          step={0.01}
          onChange={(v) => onChange({ marginBottom: v })}
        />
        <HintRow left="窄" right="宽" />
      </PanelSection>

      <Button variant="outline" block onClick={() => onChange({ ...DEFAULT_SPACING })}>
        <RotateCcw size={15} />
        恢复默认间距
      </Button>
    </div>
  );
}

function HintRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between text-[12px] text-ink-400">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

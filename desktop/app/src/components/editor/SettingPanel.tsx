import {
  AlignVerticalSpaceAround,
  type LucideIcon,
  LayoutTemplate,
  Palette,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Resume, ResumeStyle, SpacingConfig } from '@/types/resume';
import type { SettingTab } from './editorOptions';
import { SpacingPanel } from './SpacingPanel';
import { StylePanel } from './StylePanel';
import { TemplatePanel } from './TemplatePanel';
import { TextPanel } from './TextPanel';

const TABS: { key: SettingTab; label: string; title: string; icon: LucideIcon }[] = [
  { key: 'template', label: '模板', title: '选择模板', icon: LayoutTemplate },
  { key: 'text', label: '文字', title: '文字设置', icon: Type },
  { key: 'style', label: '样式', title: '样式设置', icon: Palette },
  { key: 'spacing', label: '间距', title: '间距设置', icon: AlignVerticalSpaceAround },
];

/**
 * 左侧设置栏：64px 图标竖栏 + 可收起的 308px 面板。
 *
 * 开合完全由「单击图标」驱动：收起时点图标 → 展开该分组；展开时点同一图标 → 收起；
 * 点其它图标 → 切换分组。没有额外的展开/收起箭头按钮。
 */
export function SettingPanel({
  resume,
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  onStyleChange,
  onSpacingChange,
  onSwitchTemplate,
}: {
  resume: Resume;
  tab: SettingTab;
  onTabChange: (tab: SettingTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onStyleChange: (patch: Partial<ResumeStyle>) => void;
  onSpacingChange: (patch: Partial<SpacingConfig>) => void;
  onSwitchTemplate: (id: string) => void;
}) {
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="flex h-full shrink-0">
      <div className="flex w-16 shrink-0 flex-col items-center gap-0.5 border-r border-ink-100 bg-white py-3">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              title={collapsed ? `展开${label}设置` : active ? '收起设置面板' : label}
              aria-label={collapsed ? `展开${label}设置` : active ? '收起设置面板' : label}
              onClick={() => onTabChange(key)}
              className={cn(
                'relative flex w-14 flex-col items-center gap-1 rounded-lg py-2.5 transition',
                active ? 'text-brand-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
              )}
            >
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
              )}
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  active && !collapsed && 'bg-brand-50',
                )}
              >
                <Icon size={19} />
              </span>
              <span className="text-[12px]">{label}</span>
            </button>
          );
        })}
      </div>

      {!collapsed && (
        <div className="flex w-[308px] shrink-0 flex-col border-r border-ink-100 bg-white">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink-900">{activeTab.title}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {tab === 'template' && <TemplatePanel resume={resume} onSwitch={onSwitchTemplate} />}
            {tab === 'text' && <TextPanel style={resume.style} onChange={onStyleChange} />}
            {tab === 'style' && <StylePanel style={resume.style} onChange={onStyleChange} />}
            {tab === 'spacing' && (
              <SpacingPanel spacing={resume.style.spacing} onChange={onSpacingChange} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

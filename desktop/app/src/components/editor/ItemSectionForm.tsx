import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Select, TextInput } from '@/components/common/Form';
import { DEGREES } from '@/data/design';
import { SECTION_DEFS, createItem } from '@/lib/resume';
import { cn } from '@/lib/cn';
import type { ResumeItem, ResumeSection } from '@/types/resume';
import { MODULE_FIELD_CONFIG } from './editorOptions';
import { RichTextEditor } from './RichTextEditor';
import {
  FieldRow,
  InlineField,
  ModuleHeading,
  TIME_FIELD_W,
  TimeRangeField,
} from './fields';

/** 空模块时展示的虚拟条目 id（不写入 store，首次编辑时才落库） */
const VIRTUAL_ID = '__virtual__';

type SectionUpdater = (updater: (section: ResumeSection) => ResumeSection) => void;

export function ItemSectionForm({
  section,
  onChange,
  onDelete,
}: {
  section: ResumeSection;
  onChange: SectionUpdater;
  onDelete: () => void;
}) {
  const def = section.type === 'custom' ? undefined : SECTION_DEFS[section.type];
  const config = MODULE_FIELD_CONFIG[section.type];
  const displayItems: ResumeItem[] = section.items.length
    ? section.items
    : [{ ...createItem(section.type), id: VIRTUAL_ID }];

  const patchItem = (itemId: string, patch: Partial<ResumeItem>) => {
    onChange((s) => {
      if (itemId === VIRTUAL_ID) {
        return { ...s, items: [{ ...createItem(s.type), ...patch }] };
      }
      return {
        ...s,
        items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      };
    });
  };

  const addItem = () => {
    onChange((s) => ({ ...s, items: [...s.items, createItem(s.type)] }));
  };

  const removeItem = (itemId: string) => {
    onChange((s) => ({ ...s, items: s.items.filter((it) => it.id !== itemId) }));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    onChange((s) => {
      const target = index + dir;
      if (target < 0 || target >= s.items.length) return s;
      const items = [...s.items];
      const tmp = items[index];
      items[index] = items[target];
      items[target] = tmp;
      return { ...s, items };
    });
  };

  const nameLabel = def?.namePlaceholder ?? '名称';
  const roleLabel = def?.rolePlaceholder ?? '角色';
  const realCount = section.items.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <ModuleHeading>{section.title}</ModuleHeading>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            title="删除该模块"
            className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            删除模块
          </Button>
          <Button size="sm" onClick={addItem}>
            <Plus size={14} />
            添加{section.title}
          </Button>
        </div>
      </div>

      {displayItems.map((item, index) => (
        <div key={item.id} className="relative rounded-xl border border-ink-200 bg-white p-4">
          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-[14px] font-semibold text-ink-800">
                {section.title} {index + 1}
              </p>

              {/*
                字段行几何（所有模块统一，避免切换模块时字段位置跳动）：
                  · 名称 / 角色：flex-1 自适应，最小 180px
                  · 学历（仅教育背景）：固定 150px
                  · 获奖日期（仅获奖情况）：固定 160px
                  · 时间区：固定 400px（TimeRangeField 内部宽度固定，不会被拉伸）
                  · 行尾 pr-6 留白，保证「至今」不贴边
              */}
              <FieldRow>
                <InlineField
                  label={
                    <span>
                      <span className="mr-0.5 text-red-500">*</span>
                      {nameLabel}
                    </span>
                  }
                  className="min-w-[180px] flex-1"
                >
                  <TextInput
                    value={item.name}
                    placeholder={config.namePlaceholder}
                    onChange={(e) => patchItem(item.id, { name: e.target.value })}
                  />
                </InlineField>

                <InlineField label={roleLabel} className="min-w-[180px] flex-1">
                  <TextInput
                    value={item.role}
                    placeholder={config.rolePlaceholder}
                    onChange={(e) => patchItem(item.id, { role: e.target.value })}
                  />
                </InlineField>

                {section.type === 'education' && (
                  <InlineField label="学历" className="w-[150px] shrink-0">
                    <Select
                      value={item.labelValue}
                      onChange={(e) => patchItem(item.id, { labelValue: e.target.value })}
                    >
                      <option value="">请选择</option>
                      {DEGREES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </InlineField>
                )}

                {section.type === 'award' && (
                  /* 标签固定为「获奖日期」：与下方的时间区间（获奖时间）区分，避免两个同名标签 */
                  <InlineField label="获奖日期" className="w-[160px] shrink-0">
                    <TextInput
                      value={item.labelValue}
                      placeholder="如：2024-11"
                      onChange={(e) => patchItem(item.id, { labelValue: e.target.value })}
                    />
                  </InlineField>
                )}

                <InlineField
                  label={config.timeLabel}
                  className="shrink-0"
                  style={{ width: TIME_FIELD_W }}
                >
                  <TimeRangeField
                    startDate={item.startDate}
                    endDate={item.endDate}
                    current={item.current}
                    onChange={(patch) => patchItem(item.id, patch)}
                  />
                </InlineField>
              </FieldRow>

              <div className="mt-3 flex gap-3">
                {config.descLabel && (
                  <span className="w-16 shrink-0 pt-2 text-right text-[13px] text-ink-600">
                    {config.descLabel}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <RichTextEditor
                    value={item.content}
                    placeholder={config.contentPlaceholder}
                    onChange={(content) => patchItem(item.id, { content })}
                  />
                </div>
              </div>
            </div>

            {/* 操作列始终占位（宽度固定），空状态时不渲染按钮，避免看起来像坏了 */}
            <div className="flex w-14 shrink-0 flex-col gap-1.5">
              {/* 只有一条经历时不显示上移/下移，避免两个置灰按钮看起来像坏了 */}
              {realCount >= 2 && (
                <>
                  <ActionButton
                    label="上移"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  />
                  <ActionButton
                    label="下移"
                    disabled={index === realCount - 1}
                    onClick={() => moveItem(index, 1)}
                  />
                </>
              )}
              {realCount >= 1 && (
                <ActionButton label="删除" danger onClick={() => removeItem(item.id)} />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 rounded-md text-[12px] font-medium transition disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-300',
        danger
          ? 'bg-red-50 text-red-600 hover:bg-red-100'
          : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
      )}
    >
      {label}
    </button>
  );
}

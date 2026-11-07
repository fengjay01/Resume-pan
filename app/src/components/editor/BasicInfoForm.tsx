import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Checkbox, Select, TextInput } from '@/components/common/Form';
import { MonthField } from './fields';
import { Dropdown } from '@/components/common/Misc';
import { GENDERS, WORK_YEARS } from '@/data/design';
import { uid } from '@/lib/id';
import type { BasicInfo } from '@/types/resume';
import { AvatarUploader } from './AvatarUploader';
import { ICON_OPTIONS, resolveIcon } from './editorOptions';
import { InlineField, ModuleHeading } from './fields';

export function BasicInfoForm({
  basic,
  onChange,
}: {
  basic: BasicInfo;
  onChange: (patch: Partial<BasicInfo>) => void;
}) {
  const [icon, setIcon] = useState('Calendar');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const SelectedIcon = resolveIcon(icon);

  const addField = () => {
    if (!label.trim() && !value.trim()) return;
    onChange({
      customFields: [
        ...basic.customFields,
        { id: uid('cf'), icon, label: label.trim(), value: value.trim() },
      ],
    });
    setLabel('');
    setValue('');
  };

  const removeField = (id: string) => {
    onChange({ customFields: basic.customFields.filter((f) => f.id !== id) });
  };

  return (
    /* px-4：与条目式模块卡片的内边距对齐，切换模块时字段左边界不跳动 */
    <div className="flex flex-col gap-5 px-4">
      <AvatarUploader avatar={basic.avatar} onChange={(avatar) => onChange({ avatar })} />

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-2 xl:grid-cols-4">
        <InlineField label="姓名">
          <TextInput
            value={basic.name}
            placeholder="请输入姓名"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </InlineField>

        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-right text-[13px] text-ink-600">出生日期</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* 年月选择面板（与时间区的选择器一致）：简历上只展示到年月 */}
            <MonthField
              fullWidth
              value={basic.birthDate}
              placeholder="出生年月"
              onChange={(v) => onChange({ birthDate: v })}
            />
            {/* 文案用「年龄」而非「只显示年龄」：5 个字会顶到右侧「性别」列造成文字重叠 */}
            <Checkbox
              checked={basic.showAgeOnly}
              onChange={(showAgeOnly) => onChange({ showAgeOnly })}
              label="年龄"
              className="shrink-0 whitespace-nowrap"
            />
          </div>
        </div>

        <InlineField label="性别">
          <Select
            value={basic.gender}
            onChange={(e) => onChange({ gender: e.target.value as BasicInfo['gender'] })}
          >
            <option value="">请选择</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </InlineField>

        <InlineField label="工作年限">
          <Select
            value={basic.workYears}
            onChange={(e) => onChange({ workYears: e.target.value })}
          >
            <option value="">请选择</option>
            {WORK_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </InlineField>

        <InlineField label="求职意向">
          <TextInput
            value={basic.jobIntention}
            placeholder="如：前端开发工程师"
            onChange={(e) => onChange({ jobIntention: e.target.value })}
          />
        </InlineField>

        <InlineField label="电话">
          <TextInput
            type="tel"
            value={basic.phone}
            placeholder="请输入手机号"
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </InlineField>

        <InlineField label="邮箱">
          <TextInput
            type="email"
            value={basic.email}
            placeholder="请输入邮箱"
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </InlineField>

        <InlineField label="政治面貌">
          <TextInput
            value={basic.politicalStatus}
            placeholder="如：中共党员"
            onChange={(e) => onChange({ politicalStatus: e.target.value })}
          />
        </InlineField>
      </div>

      <div className="border-t border-dashed border-ink-200 pt-4">
        <ModuleHeading>自定义/更多信息</ModuleHeading>
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <span className="shrink-0 pl-1 text-[13px] font-medium text-brand-700">+ 新增信息:</span>

            <Dropdown
              className="shrink-0"
              align="left"
              trigger={
                <button
                  type="button"
                  title="选择图标"
                  className="flex h-10 w-12 items-center justify-center gap-0.5 rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-brand-300 hover:text-brand-700"
                >
                  <SelectedIcon size={16} />
                  <ChevronDown size={12} className="text-ink-400" />
                </button>
              }
            >
              <div className="grid w-[220px] grid-cols-5 gap-1 px-2 py-1">
                {ICON_OPTIONS.map(({ name, label: label2, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    title={label2}
                    onClick={() => setIcon(name)}
                    className={
                      'flex h-9 items-center justify-center rounded-md transition hover:bg-brand-50 hover:text-brand-700 ' +
                      (name === icon ? 'bg-brand-50 text-brand-700' : 'text-ink-600')
                    }
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </Dropdown>

            <TextInput
              className="lg:w-44"
              value={label}
              placeholder="标签 (如: 实习时间)"
              onChange={(e) => setLabel(e.target.value)}
            />
            <TextInput
              className="lg:min-w-0 lg:flex-1"
              value={value}
              placeholder="具体内容"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addField();
              }}
            />
            <Button className="shrink-0" onClick={addField}>
              添加
            </Button>
          </div>

          {basic.customFields.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {basic.customFields.map((f) => {
                const Icon = resolveIcon(f.icon);
                return (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] text-ink-700"
                  >
                    <Icon size={14} className="text-brand-600" />
                    <span className="font-medium">{f.label || '未命名'}</span>
                    {f.value && <span className="text-ink-500">{f.value}</span>}
                    <button
                      type="button"
                      aria-label="删除"
                      onClick={() => removeField(f.id)}
                      className="ml-0.5 rounded p-0.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <X size={13} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

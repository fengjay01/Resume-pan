import { Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import type { ResumeSection } from '@/types/resume';
import { MODULE_FIELD_CONFIG } from './editorOptions';
import { RichTextEditor } from './RichTextEditor';
import { ModuleHeading } from './fields';

export function RichSectionForm({
  section,
  onChange,
  onDelete,
}: {
  section: ResumeSection;
  onChange: (updater: (section: ResumeSection) => ResumeSection) => void;
  onDelete: () => void;
}) {
  const config = MODULE_FIELD_CONFIG[section.type];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <ModuleHeading>{section.title}</ModuleHeading>
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
      </div>
      {/* 与条目式模块保持一致：内容一律放在卡片内，切换模块时左右边界不跳动 */}
      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <RichTextEditor
          value={section.content}
          minHeight={200}
          placeholder={config.contentPlaceholder}
          onChange={(content) => onChange((s) => ({ ...s, content }))}
        />
      </div>
    </div>
  );
}

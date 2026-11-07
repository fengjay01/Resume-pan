import { memo } from 'react';
import { Copy, LayoutGrid, List, Pencil, PenLine, Pin, Trash2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/common/Button';
import { ResumeThumbnail } from '@/components/resume';
import { formatDateCn } from '@/lib/format';
import { hasJobIntention } from '@/lib/resume';
import type { Resume } from '@/types/resume';
import { ResponsiveThumbnail } from './ResponsiveThumbnail';

export interface ResumeCardActions {
  onEdit: (resume: Resume) => void;
  onRename: (resume: Resume) => void;
  onDuplicate: (resume: Resume) => void;
  onDelete: (resume: Resume) => void;
  /** 置顶 / 取消置顶（数量不限） */
  onTogglePin: (resume: Resume) => void;
}

/** 置顶徽标：小小的胶囊标签，跟在简历名后面 */
function PinnedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-brand-700">
      <Pin className="h-3 w-3" />
      置顶
    </span>
  );
}

/** 置顶 / 取消置顶按钮 */
function PinButton({
  pinned,
  onClick,
  size = 'md',
}: {
  pinned?: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <Button
      size={size}
      variant="outline"
      className={cn(
        'shrink-0',
        pinned && 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100',
        size === 'sm' && 'px-2',
      )}
      title={pinned ? '取消置顶' : '置顶（始终排在最前）'}
      onClick={onClick}
    >
      <Pin className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {size !== 'sm' && (pinned ? '取消置顶' : '置顶')}
    </Button>
  );
}

function DeleteButton({ onClick, size = 'md' }: { onClick: () => void; size?: 'sm' | 'md' }) {
  return (
    <Button
      size={size}
      variant="outline"
      className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
      删除
    </Button>
  );
}

function JobIntention({ resume }: { resume: Resume }) {
  const filled = hasJobIntention(resume);
  return (
    <div className="w-full max-w-[280px] rounded-xl bg-ink-100/70 px-4 py-2.5">
      <div className="text-xs text-ink-400">求职意向</div>
      {filled ? (
        <div className="mt-0.5 truncate text-sm font-semibold text-ink-800">
          {resume.basic.jobIntention}
        </div>
      ) : (
        <span className="mt-1 inline-block rounded-md bg-white px-2 py-0.5 text-sm font-semibold text-ink-600">
          未填写
        </span>
      )}
    </div>
  );
}

export const ResumeCard = memo(function ResumeCard({
  resume,
  mode,
  actions,
}: {
  resume: Resume;
  mode: 'grid' | 'list';
  actions: ResumeCardActions;
}) {
  if (mode === 'grid') {
    return (
      <div
        className={cn(
          'group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float',
          resume.pinned ? 'border-brand-200' : 'border-ink-100',
        )}
      >
        <div
          className="cursor-pointer overflow-hidden border-b border-ink-100 bg-ink-50"
          onClick={() => actions.onEdit(resume)}
        >
          <ResponsiveThumbnail resume={resume} />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold text-ink-900">{resume.name}</h3>
            {resume.pinned && <PinnedBadge />}
          </div>
          <p className="text-xs text-ink-400">创建于 {formatDateCn(resume.createdAt)}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
            <Button
              size="sm"
              className="min-w-fit flex-1 px-2.5"
              onClick={() => actions.onEdit(resume)}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 px-2"
              title="重命名"
              onClick={() => actions.onRename(resume)}
            >
              <PenLine className="h-3.5 w-3.5" />
            </Button>
            <PinButton
              size="sm"
              pinned={resume.pinned}
              onClick={() => actions.onTogglePin(resume)}
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 px-2"
              title="复制"
              onClick={() => actions.onDuplicate(resume)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-red-200 px-2 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              title="删除"
              onClick={() => actions.onDelete(resume)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-2xl border bg-white p-4 shadow-card transition duration-200 hover:shadow-float sm:flex-row',
        resume.pinned ? 'border-brand-200' : 'border-ink-100',
      )}
    >
      <div
        className="w-[180px] shrink-0 cursor-pointer overflow-hidden rounded-lg border border-ink-100 bg-white"
        onClick={() => actions.onEdit(resume)}
      >
        <ResumeThumbnail resume={resume} width={178} />
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-lg font-semibold text-ink-900">{resume.name}</h3>
          {resume.pinned && <PinnedBadge />}
        </div>
        <p className="mt-1 text-[13px] text-ink-400">创建于 {formatDateCn(resume.createdAt)}</p>

        <div className="mt-4 flex flex-1 flex-col justify-end gap-4 md:flex-row md:items-end md:justify-between">
          <JobIntention resume={resume} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => actions.onEdit(resume)}>
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
            <Button variant="outline" onClick={() => actions.onRename(resume)}>
              <PenLine className="h-4 w-4" />
              重命名
            </Button>
            <PinButton pinned={resume.pinned} onClick={() => actions.onTogglePin(resume)} />
            <Button variant="outline" onClick={() => actions.onDuplicate(resume)}>
              <Copy className="h-4 w-4" />
              复制
            </Button>
            <DeleteButton onClick={() => actions.onDelete(resume)} />
          </div>
        </div>
      </div>
    </div>
  );
});

export function ViewToggle({
  mode,
  onChange,
  className,
}: {
  mode: 'grid' | 'list';
  onChange: (m: 'grid' | 'list') => void;
  className?: string;
}) {
  const items: { key: 'grid' | 'list'; label: string; icon: LucideIcon }[] = [
    { key: 'grid', label: '网格', icon: LayoutGrid },
    { key: 'list', label: '列表', icon: List },
  ];
  return (
    <div className={cn('inline-flex rounded-xl border border-ink-200 bg-white p-1', className)}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
            mode === it.key ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100',
          )}
        >
          <it.icon className="h-4 w-4" />
          {it.label}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/Misc';
import { useResumeStore } from '@/store/resumeStore';
import { cn } from '@/lib/cn';
import { formatDateCn, formatRelative, trashDaysLeft } from '@/lib/format';
import { TRASH_RETENTION_DAYS, TRASH_RETENTION_MS, type TrashedResume } from '@/types/resume';

/**
 * 回收站：删除的简历先放这里，保留 30 天，期间可随时恢复；到期自动彻底删除。
 * 也支持手动「彻底删除」与「清空回收站」。
 */
export default function TrashPage() {
  const navigate = useNavigate();
  const trashed = useResumeStore((s) => s.trashed);
  const restore = useResumeStore((s) => s.restore);
  const purge = useResumeStore((s) => s.purge);
  const emptyTrash = useResumeStore((s) => s.emptyTrash);
  const purgeExpired = useResumeStore((s) => s.purgeExpired);

  const [purgeTarget, setPurgeTarget] = useState<TrashedResume | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 进入页面先清一遍过期项；停留期间每 10 分钟再清一遍（到点自动删除）
  useEffect(() => {
    purgeExpired();
    const timer = window.setInterval(() => purgeExpired(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [purgeExpired]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleRestore = (entry: TrashedResume) => {
    restore(entry.resume.id);
    setToast(`已恢复「${entry.resume.name}」`);
  };

  const confirmPurge = () => {
    if (!purgeTarget) return;
    purge(purgeTarget.resume.id);
    setPurgeTarget(null);
    setToast('已彻底删除');
  };

  const confirmEmpty = () => {
    emptyTrash();
    setEmptyOpen(false);
    setToast('回收站已清空');
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      {/* 页头 */}
      <Link
        to="/resumes"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        返回我的简历
      </Link>

      <div className="mt-5 flex flex-col gap-5 rounded-2xl border border-ink-100 bg-white p-6 shadow-card md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink-900">
              回收站
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              删除的简历会在这里保留 {TRASH_RETENTION_DAYS} 天，期间可以随时恢复；
              超过 {TRASH_RETENTION_DAYS} 天将自动彻底删除，不可找回。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-ink-500">
            {trashed.length} 份
          </span>
          <Button
            variant="outline"
            disabled={trashed.length === 0}
            onClick={() => setEmptyOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            清空回收站
          </Button>
        </div>
      </div>

      {/* 列表 */}
      {trashed.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Trash2 className="h-10 w-10" />}
            title="回收站是空的"
            description={`你删除的简历会在这里保留 ${TRASH_RETENTION_DAYS} 天，期间随时可以恢复。`}
            action={
              <Button variant="outline" onClick={() => navigate('/resumes')}>
                <ArrowLeft className="h-4 w-4" />
                返回我的简历
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {trashed.map((entry) => {
            const days = trashDaysLeft(entry.deletedAt, TRASH_RETENTION_MS);
            const urgent = days <= 3;
            return (
              <div
                key={entry.resume.id}
                data-trash-id={entry.resume.id}
                className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:shadow-float sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-ink-50 text-ink-300">
                    {entry.resume.basic.avatar ? (
                      <img
                        src={entry.resume.basic.avatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-semibold text-ink-900">
                        {entry.resume.name}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
                          urgent
                            ? 'bg-red-50 text-red-600'
                            : 'bg-ink-100 text-ink-500',
                        )}
                      >
                        {days > 0 ? `${days} 天后彻底删除` : '即将删除'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      删除于 {formatRelative(entry.deletedAt)} · {formatDateCn(entry.deletedAt)}
                      {entry.resume.sections.length > 0 &&
                        ` · ${entry.resume.sections.filter((s) => s.visible).length} 个模块`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" onClick={() => handleRestore(entry)}>
                    <RotateCcw className="h-4 w-4" />
                    恢复
                  </Button>
                  <Button variant="ghost" onClick={() => setPurgeTarget(entry)}>
                    <Trash2 className="h-4 w-4" />
                    彻底删除
                  </Button>
                </div>
              </div>
            );
          })}

          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-400">
            <TriangleAlert className="h-3.5 w-3.5" />
            恢复后的简历会回到列表原来所在的位置。
          </p>
        </div>
      )}

      {/* 彻底删除单条 */}
      <ConfirmDialog
        open={!!purgeTarget}
        title="彻底删除这份简历？"
        description={
          <>
            将永久删除
            <span className="mx-1 font-medium text-ink-800">{purgeTarget?.resume.name}</span>
            ，此操作不可恢复。
          </>
        }
        confirmText="彻底删除"
        danger
        onConfirm={confirmPurge}
        onCancel={() => setPurgeTarget(null)}
      />

      {/* 清空回收站 */}
      <ConfirmDialog
        open={emptyOpen}
        title="清空回收站？"
        description={`将永久删除回收站里的 ${trashed.length} 份简历，此操作不可恢复。`}
        confirmText="清空"
        danger
        onConfirm={confirmEmpty}
        onCancel={() => setEmptyOpen(false)}
      />

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[1100] -translate-x-1/2 animate-slide-up">
          <div className="flex items-center gap-2 rounded-full bg-ink-900/90 px-4 py-2 text-sm text-white shadow-float">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

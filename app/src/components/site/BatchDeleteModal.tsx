import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { useResumeStore } from '@/store/resumeStore';
import { formatRelative } from '@/lib/format';
import { TRASH_RETENTION_DAYS } from '@/types/resume';
import { cn } from '@/lib/cn';
import type { Resume } from '@/types/resume';

/**
 * 批量删除简历。
 *
 * 多选后两条通道，与单份删除的语义完全一致：
 *  ① 移入回收站（软删除）：{TRASH_RETENTION_DAYS} 天内可随时恢复，到期自动彻底删除；
 *  ② 彻底删除：跳过回收站直接永久删除，不可恢复 —— 走两步确认（先点「彻底删除」
 *     进入确认态，再点「确认彻底删除」才执行），避免一键误删。
 *
 * 批量动作走 store 的 removeMany / purgeMany：一次 set() 一次持久化写入，
 * 不逐份循环 remove（避免 N 次 localStorage 写和中间态渲染）。
 */

interface BatchDeleteModalProps {
  open: boolean;
  onClose: () => void;
  resumes: Resume[];
  /** 移入回收站成功（数量） */
  onTrashed?: (count: number) => void;
  /** 彻底删除成功（数量） */
  onPurged?: (count: number) => void;
}

export function BatchDeleteModal({ open, onClose, resumes, onTrashed, onPurged }: BatchDeleteModalProps) {
  // 打开时的重置逻辑只依赖 open，resumes 用 ref 拿最新值，避免列表变化重置选择
  const resumesRef = useRef(resumes);
  resumesRef.current = resumes;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** 彻底删除的两步确认态：false = 常规页脚；true = 页脚切换为「确认彻底删除」 */
  const [confirmPurge, setConfirmPurge] = useState(false);

  const removeMany = useResumeStore((s) => s.removeMany);
  const purgeMany = useResumeStore((s) => s.purgeMany);

  /* 打开时重置：默认全不选（删除是破坏性操作，不学批量导出的「默认全选」） */
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setConfirmPurge(false);
  }, [open]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === resumesRef.current.length
        ? new Set<string>()
        : new Set(resumesRef.current.map((r) => r.id)),
    );
  }, []);

  const trash = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    removeMany(ids);
    setSelected(new Set());
    setConfirmPurge(false);
    onClose();
    onTrashed?.(ids.length);
  }, [selected, removeMany, onClose, onTrashed]);

  const purge = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    purgeMany(ids);
    setSelected(new Set());
    setConfirmPurge(false);
    onClose();
    onPurged?.(ids.length);
  }, [selected, purgeMany, onClose, onPurged]);

  if (!open) return null;

  const allSelected = selected.size === resumes.length && resumes.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="批量删除简历"
      width={560}
      footer={
        confirmPurge ? (
          <>
            <Button variant="outline" onClick={() => setConfirmPurge(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={purge}>
              <Trash2 className="h-4 w-4" />
              确认彻底删除（{selected.size}）
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setConfirmPurge(true)}
              disabled={selected.size === 0}
            >
              <Trash2 className="h-4 w-4" />
              彻底删除（{selected.size}）
            </Button>
            <Button onClick={trash} disabled={selected.size === 0}>
              <Trash2 className="h-4 w-4" />
              移入回收站（{selected.size}）
            </Button>
          </>
        )
      }
    >
      {confirmPurge ? (
        /* ------------------- 彻底删除：两步确认 ------------------- */
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/70 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-[13px] leading-relaxed text-red-800">
            <p className="font-semibold">将彻底删除 {selected.size} 份简历，此操作不可恢复。</p>
            <p className="mt-1 text-red-700/90">
              这些简历不会进入回收站，删除后无法恢复，请确认不再需要。
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-500">
          默认<span className="font-medium text-ink-800">移入回收站</span>，
          {TRASH_RETENTION_DAYS} 天内可随时恢复；也可以选择
          <span className="font-medium text-red-700">彻底删除</span>
          （跳过回收站，不可恢复）。
        </p>
      )}

      {/* 选择列表（与批量导出同款交互） */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[13px] text-ink-500">
          已选 {selected.size} / {resumes.length} 份
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[13px] font-medium text-brand-600 transition hover:text-brand-700"
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="mt-2 max-h-[280px] overflow-y-auto rounded-xl border border-ink-100">
        {resumes.length === 0 && (
          <p className="px-3.5 py-6 text-center text-[13px] text-ink-400">还没有简历</p>
        )}
        {resumes.map((r) => {
          const on = selected.has(r.id);
          return (
            <label
              key={r.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-ink-50 px-3.5 py-2.5 transition last:border-b-0',
                on ? 'bg-brand-50/40' : 'hover:bg-ink-50',
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                {r.name || '未命名简历'}
              </span>
              <span className="shrink-0 text-xs text-ink-400">
                更新于 {formatRelative(r.updatedAt)}
              </span>
            </label>
          );
        })}
      </div>

      {!confirmPurge && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-300">
          <Check className="h-3.5 w-3.5" />
          移入回收站的简历可在回收站中恢复或彻底删除
        </p>
      )}
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Check,
  Copy,
  DatabaseBackup,
  Download,
  FileText,
  RotateCcw,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/Modal';
import { TextInput } from '@/components/common/Form';
import { cn } from '@/lib/cn';
import { formatDateCn } from '@/lib/format';
import { applyBackup, countLocalResumes, downloadBackup, parseBackup, type ParsedBackup } from '@/lib/backup';
import { useAuthStore } from '@/store/auth';
import { DesktopDataSection } from '@/components/site/DesktopDataSection';

export default function AccountPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateNickname = useAuthStore((s) => s.updateNickname);

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSideId, setCopiedSideId] = useState(false);

  /* ------------------------------ 数据备份 / 恢复 ----------------------------- */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeCount, setResumeCount] = useState(() => countLocalResumes());
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null);
  const [backupMessage, setBackupMessage] = useState('');

  useEffect(() => {
    if (!copiedId) return;
    const t = window.setTimeout(() => setCopiedId(false), 1800);
    return () => window.clearTimeout(t);
  }, [copiedId]);

  useEffect(() => {
    if (!copiedSideId) return;
    const t = window.setTimeout(() => setCopiedSideId(false), 1800);
    return () => window.clearTimeout(t);
  }, [copiedSideId]);

  useEffect(() => {
    if (!backupMessage) return;
    const t = window.setTimeout(() => setBackupMessage(''), 4000);
    return () => window.clearTimeout(t);
  }, [backupMessage]);

  if (!user) return null;

  const copyId = async (side: boolean) => {
    try {
      await navigator.clipboard.writeText(user.id);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
    if (side) setCopiedSideId(true);
    else setCopiedId(true);
  };

  const submitNickname = () => {
    const next = nickname.trim();
    if (next) updateNickname(next);
  };

  const resetNickname = () => setNickname(user.nickname);

  /* ------------------------------ 数据备份 / 恢复 ----------------------------- */
  const handleExport = () => {
    downloadBackup();
    setBackupMessage('备份文件已开始下载，请妥善保管');
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一个文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseBackup(String(reader.result ?? ''));
      if (!result.ok) {
        setBackupMessage(`导入失败：${result.error}`);
        return;
      }
      setPendingImport(result);
    };
    reader.onerror = () => setBackupMessage('导入失败：文件读取失败，请重试');
    reader.readAsText(file, 'utf-8');
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    applyBackup(pendingImport.file);
    setPendingImport(null);
    // 刷新页面让 zustand 从 localStorage 重新水合
    window.location.reload();
  };

  const navItemCls =
    'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition';

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* 侧边栏 */}
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-24">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 text-center shadow-card">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-600">
              {user.nickname.slice(0, 1).toUpperCase()}
            </div>
            <div className="mt-4 truncate text-base font-semibold text-ink-900">
              {user.nickname}
            </div>
            <button
              type="button"
              onClick={() => copyId(true)}
              className="mx-auto mt-1 inline-flex max-w-full items-center gap-1 text-xs text-ink-400 transition hover:text-brand-600"
              title="复制账户 ID"
            >
              <span className="truncate">ID: {user.id}</span>
              {copiedSideId ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0" />
              )}
            </button>
          </div>

          <nav className="rounded-2xl border border-ink-100 bg-white p-2 shadow-card">
            <button type="button" className={cn(navItemCls, 'bg-brand-50 text-brand-700')}>
              <UserIcon className="h-4 w-4" />
              基本信息
            </button>
            <button
              type="button"
              onClick={() => navigate('/resumes')}
              className={cn(navItemCls, 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}
            >
              <FileText className="h-4 w-4" />
              我的简历
            </button>
            <button
              type="button"
              onClick={() => navigate('/templates')}
              className={cn(navItemCls, 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}
            >
              <BookOpen className="h-4 w-4" />
              使用教程
            </button>
          </nav>
        </aside>

        {/* 基本信息 */}
        <section className="rounded-2xl border border-ink-100 bg-white p-8 shadow-card">
          <h1 className="text-lg font-semibold text-ink-900">基本信息</h1>

          <div className="mt-7 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-sm text-ink-500">ID</span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">
                {user.id}
              </span>
              <Button size="sm" variant="outline" onClick={() => copyId(false)}>
                {copiedId ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiedId ? '已复制' : '复制'}
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-sm text-ink-500">昵称</span>
              <TextInput
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNickname();
                }}
                placeholder="请输入昵称"
                className="max-w-xl"
              />
            </div>

            <div className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-sm text-ink-500">注册时间</span>
              <span className="text-sm text-ink-800">{formatDateCn(user.createdAt)}</span>
            </div>

            <div className="flex items-center gap-3 pl-20">
              <Button onClick={submitNickname}>提交</Button>
              <Button variant="outline" onClick={resetNickname}>
                <RotateCcw className="h-4 w-4" />
                重置
              </Button>
            </div>
          </div>

          {/* 数据备份 / 恢复 */}
          <div className="mt-10 border-t border-dashed border-ink-200 pt-7">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <DatabaseBackup className="h-4.5 w-4.5 text-brand-600" />
              数据备份
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
              简历数据保存在本浏览器中，换浏览器或清除浏览器数据会丢失。可导出 JSON
              备份文件妥善保管，或在其它设备上导入恢复（当前共 <span className="font-medium text-ink-700">{resumeCount}</span> 份简历）。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4" />
                导出备份
              </Button>
              <Button variant="outline" onClick={handlePickFile}>
                <Upload className="h-4 w-4" />
                导入备份
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFileChange}
              />
              {backupMessage && <span className="text-[13px] text-ink-500">{backupMessage}</span>}
            </div>
          </div>

          {/* 数据存储位置（仅桌面端显示；Web 端数据随浏览器走，无此概念） */}
          <DesktopDataSection />
        </section>

        <ConfirmDialog
          open={!!pendingImport}
          danger
          title="导入备份"
          description={`备份中包含 ${pendingImport?.resumes ?? 0} 份简历。导入将覆盖当前浏览器里的全部简历数据，且不可恢复，确定继续吗？`}
          confirmText="导入并覆盖"
          onCancel={() => setPendingImport(null)}
          onConfirm={confirmImport}
        />
      </div>
    </div>
  );
}

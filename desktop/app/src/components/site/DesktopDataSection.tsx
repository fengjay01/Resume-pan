import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';

/**
 * 桌面端专属：数据存储位置设置（Web 端不渲染）。
 *
 * 简历数据随 Electron 的 userData 目录走（Local Storage/leveldb）。选择新文件夹
 * 写入 data-folder.json 后**重启应用**生效；可选一次性迁移现有数据（主进程在
 * 启动早期、任何存储子系统打开之前复制 Local Storage，绝不覆盖目标已有数据）。
 */

/** 主进程注入的桌面端设置 API（见 desktop/electron/preload.cjs） */
interface DesktopSettingsApi {
  getDataFolderInfo(): Promise<{ current: string; isDefault: boolean; defaultPath: string }>;
  chooseDataFolder(): Promise<
    | { canceled: true }
    | { canceled: false; target: string; isCurrent: boolean; migrateAvailable: boolean; error?: string }
  >;
  applyDataFolder(payload: { target: string; migrate: boolean }): Promise<{ ok: boolean; error?: string }>;
  openDataFolder(): Promise<boolean>;
}

function getApi(): DesktopSettingsApi | undefined {
  return (window as unknown as { desktopSettings?: DesktopSettingsApi }).desktopSettings;
}

export function DesktopDataSection() {
  const [isDesktop] = useState(() => !!getApi());
  const [info, setInfo] = useState<{ current: string; isDefault: boolean; defaultPath: string } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [migrateChecked, setMigrateChecked] = useState(true);
  const [migrateAvailable, setMigrateAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setInfo(await api.getDataFolderInfo());
  }, []);

  useEffect(() => {
    if (isDesktop) void load();
  }, [isDesktop, load]);

  const choose = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setMsg('');
    const res = await api.chooseDataFolder();
    if (res.canceled) return;
    if ('error' in res && res.error) {
      setMsg(res.error);
      return;
    }
    if (res.isCurrent) {
      setMsg('已经在使用这个文件夹了');
      return;
    }
    setMigrateAvailable(res.migrateAvailable);
    setMigrateChecked(res.migrateAvailable);
    setPendingTarget(res.target);
  }, []);

  const apply = useCallback(
    async (migrate: boolean) => {
      const api = getApi();
      if (!api || !pendingTarget) return;
      setBusy(true);
      const r = await api.applyDataFolder({ target: pendingTarget, migrate });
      if (!r.ok) {
        setMsg(r.error || '切换失败，请重试');
        setBusy(false);
        return;
      }
      // 主进程 relaunch + exit，页面随应用一起退出；文案只在极端情况下可见
      setMsg('正在重启应用…');
    },
    [pendingTarget],
  );

  const resetToDefault = useCallback(async () => {
    const api = getApi();
    if (!api || !info) return;
    setBusy(true);
    const r = await api.applyDataFolder({ target: info.defaultPath, migrate: false });
    if (!r.ok) {
      setMsg(r.error || '切换失败，请重试');
      setBusy(false);
      return;
    }
    setMsg('正在重启应用…');
  }, [info]);

  if (!isDesktop) return null;

  return (
    <div className="mt-10 border-t border-dashed border-ink-200 pt-7">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
        <HardDrive className="h-4.5 w-4.5 text-brand-600" />
        数据存储位置
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
        简历数据保存在下方文件夹中（含全部简历、回收站与偏好设置）。更换文件夹后应用会自动重启，
        可选择把现有数据一并迁移过去。
      </p>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-ink-500 shadow-sm">
          <FolderOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-[13px] leading-relaxed text-ink-800">
            {info?.current ?? '读取中…'}
          </p>
          {info && !info.isDefault && (
            <p className="mt-1 text-xs text-brand-600">已使用自定义文件夹（默认：{info.defaultPath}）</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={choose} disabled={busy}>
          更改位置…
        </Button>
        <Button variant="outline" onClick={resetToDefault} disabled={busy || !!info?.isDefault}>
          恢复默认
        </Button>
        <Button variant="ghost" onClick={() => void getApi()?.openDataFolder()} disabled={busy}>
          <FolderOpen className="h-4 w-4" />
          打开文件夹
        </Button>
        {msg && (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-500">
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {msg}
          </span>
        )}
      </div>

      <Modal
        open={!!pendingTarget}
        onClose={() => !busy && setPendingTarget(null)}
        title="切换数据存储位置"
        width={480}
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingTarget(null)} disabled={busy}>
              取消
            </Button>
            <Button onClick={() => void apply(migrateChecked)} loading={busy}>
              {migrateChecked ? '迁移数据并切换' : '切换（不迁移数据）'}
            </Button>
          </>
        }
      >
        <div className="text-[13px] leading-relaxed text-ink-600">
          新的数据存储位置：
          <p className="mt-1 break-all rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-xs text-ink-800">
            {pendingTarget}
          </p>
          <p className="mt-2.5">
            确认后应用会自动重启并使用新位置。建议先在上方「数据备份」处导出一份 JSON
            备份以防万一。
          </p>
        </div>

        {migrateAvailable ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={migrateChecked}
              onChange={(e) => setMigrateChecked(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="text-[13px] text-ink-800">
              迁移现有数据到新文件夹（推荐，含全部简历 / 回收站 / 偏好设置）
            </span>
          </label>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-800">
            目标文件夹里已有本应用的数据，将直接使用它（不会覆盖、也不迁移当前数据）。
          </p>
        )}
      </Modal>
    </div>
  );
}

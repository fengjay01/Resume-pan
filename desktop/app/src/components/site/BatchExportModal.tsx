import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  FileDown,
  FolderOpen,
  ImageDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { ResumeRenderer } from '@/components/resume';
import { renderImagePdfBlob, saveBlob } from '@/lib/export';
import { probeService, requestServicePdfBlob } from '@/lib/serverExport';
import {
  pickSaveFolder,
  supportsFolderPicker,
  writeFileToFolder,
  type FsDirectoryHandle,
} from '@/lib/folderSave';
import { EXPORT_BUILD_ID } from '@/lib/version';
import { formatRelative } from '@/lib/format';
import { A4_WIDTH } from '@/data/design';
import { cn } from '@/lib/cn';
import type { Resume } from '@/types/resume';

/**
 * 批量导出简历。
 *
 * 导出方式与编辑器「下载简历」下拉的两种完全一致（同一套导出引擎）：
 *  ① 浏览器导出：本地渲染服务（无头 Chrome printToPDF）出**无损矢量 PDF**，一键下载；
 *  ② 图片版 PDF：把 ① 的矢量 PDF 栅格化装进 jsPDF，兼容老阅读器 / 投递系统。
 *
 * 与单份导出的差异只在「逐份循环」：每份简历离屏挂载 → 等两趟渲染稳定 →
 * 走同一条导出链路，产物与单份导出逐字节同源（含 PDF 元数据里的简历数据，可 1:1 导入）。
 *
 * 两种方式都经由本地渲染服务出图（图片版的几何源就是服务的矢量 PDF），
 * 因此批量导出前会探测服务；服务没起时给出启动指引，而不是逐份失败。
 *
 * 保存位置：支持 File System Access API 的浏览器（Chrome / Edge）可让用户选一个文件夹，
 * 逐份直写其中（不经浏览器下载，规避多文件下载拦截）；不支持的浏览器走默认下载目录。
 */

/** 批量导出的两种方式，与编辑器导出一一对应 */
export type BatchExportMode = 'vector' | 'image';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/**
 * 等离屏容器里的简历完成「两趟渲染」并稳定下来。
 * ResumeRenderer 的流程是：先渲染单页兜底 → 离屏量测 → 贪心分页重渲染，
 * 字体就绪后还会重量测一次。这里等字体 / 图片就绪后，轮询到页数连续两次不变即可。
 */
async function waitRenderSettle(root: HTMLElement): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    /* 字体加载失败不阻断导出 */
  }
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete
        ? null
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 40; i += 1) {
    await sleep(70);
    const n = root.querySelectorAll('.resume-page').length;
    stable = n > 0 && n === last ? stable + 1 : 0;
    last = n;
    if (stable >= 2) return;
  }
}

/** 文件名净化：去掉文件系统非法字符，统一不加扩展名（导出函数会补 .pdf） */
function safeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\.pdf$/i, '')
    .trim();
  return (cleaned || '我的简历').slice(0, 60);
}

interface BatchExportModalProps {
  open: boolean;
  onClose: () => void;
  resumes: Resume[];
}

export function BatchExportModal({ open, onClose, resumes }: BatchExportModalProps) {
  // 打开时的重置逻辑只依赖 open，resumes 用 ref 拿最新值，避免每次列表变化都重置选择
  const resumesRef = useRef(resumes);
  resumesRef.current = resumes;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<BatchExportMode>('vector');
  /** null = 探测中；true/false = 本地渲染服务在不在跑 */
  const [serviceUp, setServiceUp] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [summary, setSummary] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);
  /** 用户选择的保存文件夹（null = 浏览器默认下载目录） */
  const [dirHandle, setDirHandle] = useState<FsDirectoryHandle | null>(null);
  const [folderError, setFolderError] = useState('');
  /** File System Access API 只有 Chromium 系有；不支持时整块隐藏选择入口 */
  const folderSupported = useMemo(() => supportsFolderPicker(), []);

  /** 离屏 1:1 渲染容器：逐份挂载待导出简历（几何源与编辑器导出完全一致） */
  const exportRootRef = useRef<HTMLDivElement | null>(null);
  const [renderResume, setRenderResume] = useState<Resume | null>(null);

  /* 打开时重置状态：默认全选 + 探测渲染服务 */
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(resumesRef.current.map((r) => r.id)));
    setMode('vector');
    setSummary(null);
    setProgress({ done: 0, total: 0, current: '' });
    setRenderResume(null);
    setRunning(false);
    setDirHandle(null);
    setFolderError('');
    let alive = true;
    void probeService().then((up) => {
      if (alive) setServiceUp(up);
    });
    return () => {
      alive = false;
    };
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

  const recheckService = useCallback(() => {
    setServiceUp(null);
    void probeService().then(setServiceUp);
  }, []);

  /** 选择保存文件夹（系统对话框）；取消不变，失败给提示 */
  const onPickFolder = useCallback(async () => {
    setFolderError('');
    try {
      const dir = await pickSaveFolder();
      if (dir) setDirHandle(dir);
    } catch (err) {
      setFolderError(
        err instanceof Error ? `无法使用该文件夹：${err.message}` : '选择文件夹失败，请重试',
      );
    }
  }, []);

  /** 把一份简历挂进离屏容器并等渲染稳定，返回导出根节点 */
  const mountResume = useCallback(async (resume: Resume): Promise<HTMLElement> => {
    setRenderResume(resume);
    // 轮询等 React 提交（比固定帧数稳：提交时机会随调度变化）
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await sleep(30);
      const root = exportRootRef.current;
      if (root && root.querySelector('.resume-page')) break;
    }
    const root = exportRootRef.current;
    if (!root) throw new Error('离屏渲染容器未就绪');
    await waitRenderSettle(root);
    return root;
  }, []);

  const runBatch = useCallback(async () => {
    const list = resumesRef.current.filter((r) => selected.has(r.id));
    if (!list.length) return;
    setRunning(true);
    setSummary(null);
    const ok: string[] = [];
    const failed: { name: string; error: string }[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      setProgress({ done: i, total: list.length, current: r.name || '未命名简历' });
      try {
        const root = await mountResume(r);
        const filename = safeFileName(r.name);
        // 与单份导出同一引擎，只是拿 Blob 而不直接下载（写文件夹时不能走下载通道）
        const blob =
          mode === 'vector'
            ? await requestServicePdfBlob({ root, filename, embed: { resume: r } })
            : await renderImagePdfBlob(root, filename, { resume: r });
        if (dirHandle) {
          await writeFileToFolder(dirHandle, `${filename}.pdf`, blob);
          await sleep(120); // 直写也留个节奏，让进度条走得出来
        } else {
          saveBlob(blob, `${filename}.pdf`);
          // 浏览器连续触发多个下载可能被拦截，文件之间留一点喘息
          await sleep(400);
        }
        ok.push(r.name || '未命名简历');
      } catch (err) {
        failed.push({
          name: r.name || '未命名简历',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setProgress({ done: list.length, total: list.length, current: '' });
    setRenderResume(null);
    setSummary({ ok: ok.length, failed });
    setRunning(false);
  }, [selected, mode, mountResume, dirHandle]);

  const startExport = useCallback(async () => {
    if (!resumesRef.current.some((r) => selected.has(r.id))) return;
    // 两种方式都经由本地渲染服务出图，开始前再确认一次（打开期间服务可能刚起）
    const up = await probeService();
    setServiceUp(up);
    if (!up) return; // 面板里已有启动指引
    await runBatch();
  }, [selected, runBatch]);

  const modes: { key: BatchExportMode; title: string; desc: string; icon: React.ReactNode }[] = [
    {
      key: 'vector',
      title: '浏览器导出（推荐 · 无损矢量 · 放大不失真）',
      desc: '浏览器排版引擎渲染，文字可选中、放大不模糊',
      icon: <FileDown className="h-4 w-4" />,
    },
    {
      key: 'image',
      title: '图片版 PDF（兼容模式）',
      desc: '矢量 PDF 栅格化为图片，兼容老阅读器 / 投递系统',
      icon: <ImageDown className="h-4 w-4" />,
    },
  ];

  if (!open) return null;

  const allSelected = selected.size === resumes.length && resumes.length > 0;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="批量导出简历"
        width={560}
        closable={!running}
        footer={
          summary ? (
            <Button onClick={onClose}>完成</Button>
          ) : running ? undefined : (
            <>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                onClick={startExport}
                disabled={selected.size === 0 || serviceUp === false}
              >
                <Download className="h-4 w-4" />
                开始导出（{selected.size}）
              </Button>
            </>
          )
        }
      >
        {running ? (
          /* ------------------------------ 导出进度 ------------------------------ */
          <div className="py-5">
            <div className="flex items-center gap-3 text-sm text-ink-700">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              <span className="min-w-0">
                正在导出 {Math.min(progress.done + 1, progress.total)}/{progress.total}：
                <span className="font-medium text-ink-900">{progress.current}</span>
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-ink-400">
              {dirHandle
                ? '逐份渲染并写入所选文件夹，请勿关闭页面。'
                : '逐份渲染中，请勿关闭页面。若浏览器询问「允许下载多个文件」，请选择允许。'}
            </p>
          </div>
        ) : summary ? (
          /* ------------------------------ 导出结果 ------------------------------ */
          <div className="py-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">导出完成</p>
                <p className="text-[13px] text-ink-500">
                  成功 {summary.ok} 份{summary.failed.length > 0 ? `，失败 ${summary.failed.length} 份` : ''}
                </p>
                <p className="text-[12px] text-ink-400">
                  已保存到：{dirHandle ? dirHandle.name : '浏览器默认下载目录'}
                </p>
              </div>
            </div>
            {summary.failed.length > 0 && (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/60 px-3.5 py-3">
                {summary.failed.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="text-[13px] leading-relaxed text-red-700">
                    <span className="font-medium">{f.name}</span>：{f.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ---------------------------- 选择 + 导出方式 ---------------------------- */
          <div>
            <div className="flex items-center justify-between">
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
            <div className="mt-2 max-h-[240px] overflow-y-auto rounded-xl border border-ink-100">
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

            <p className="mt-5 text-[13px] font-medium text-ink-700">导出方式（与单份导出一致）</p>
            <div className="mt-2 flex flex-col gap-2">
              {modes.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                    mode === m.key
                      ? 'border-brand-300 bg-brand-50/50'
                      : 'border-ink-100 hover:border-ink-200 hover:bg-ink-50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      mode === m.key ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500',
                    )}
                  >
                    {m.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">{m.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">{m.desc}</span>
                  </span>
                  <span
                    className={cn(
                      'mt-1 h-4 w-4 shrink-0 rounded-full border',
                      mode === m.key ? 'border-brand-600 bg-brand-600' : 'border-ink-300',
                    )}
                  />
                </button>
              ))}
            </div>

            <p className="mt-5 text-[13px] font-medium text-ink-700">保存位置</p>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-ink-500 shadow-sm">
                <FolderOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-800">
                  {dirHandle ? dirHandle.name : '浏览器默认下载目录'}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {dirHandle
                    ? '导出将直接写入该文件夹，不经过浏览器下载'
                    : folderSupported
                      ? '可选择文件夹，导出直接写入其中'
                      : '当前浏览器不支持选择文件夹（需 Chrome / Edge），将使用浏览器默认下载'}
                </p>
              </div>
              {folderSupported && (
                <Button size="sm" variant="outline" onClick={onPickFolder}>
                  {dirHandle ? '更改' : '选择文件夹'}
                </Button>
              )}
            </div>
            {folderError && <p className="mt-1.5 text-xs text-red-600">{folderError}</p>}

            {serviceUp === null && (
              <p className="mt-3 text-xs text-ink-400">正在检测本地渲染服务…</p>
            )}
            {serviceUp === false && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  本地渲染服务未启动（127.0.0.1:8790），两种导出方式都需要它出图。dev
                  模式下会随 vite 自动拉起；也可手动运行
                  <code className="mx-1 rounded bg-amber-100/70 px-1 py-0.5 text-xs">
                    node tools/export-service.mjs
                  </code>
                  <button
                    type="button"
                    onClick={recheckService}
                    className="ml-1.5 inline-flex items-center gap-1 font-medium text-amber-900 underline-offset-2 transition hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新检测
                  </button>
                </span>
              </div>
            )}

            <p className="mt-4 text-[11px] text-ink-300">
              导出引擎 {EXPORT_BUILD_ID} · 每份简历导出为独立 PDF，内含简历数据可 1:1 导入还原
            </p>
          </div>
        )}
      </Modal>

      {/* 离屏 1:1 渲染容器：与编辑器导出同款布局（fixed + 移出视口，不参与页面流） */}
      <div
        ref={exportRootRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: -99999,
          top: 0,
          width: A4_WIDTH,
          zIndex: -1,
          pointerEvents: 'none',
        }}
      >
        {renderResume && (
          <ResumeRenderer key={renderResume.id} resume={renderResume} withShadow={false} />
        )}
      </div>
    </>
  );
}

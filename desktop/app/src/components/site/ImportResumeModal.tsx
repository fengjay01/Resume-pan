import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FileUp,
  Loader2,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { TextInput } from '@/components/common/Form';
import { TEMPLATES } from '@/data/templates';
import { cn } from '@/lib/cn';
import {
  buildResumeFromImport,
  ocrResumeFile,
  parseResumeText,
  readResumeFile,
  resumeFromEmbedded,
  type ImportResult,
} from '@/lib/resumeImport';
import type { Resume } from '@/types/resume';

type Mode = 'paste' | 'file';

/** 批量模式：一次多选文件后，逐份导入的列表项 */
type ItemStatus = 'pending' | 'reading' | 'ocr' | 'done' | 'skipped' | 'failed';
interface ImportItem {
  file: File;
  /** 目标简历名（默认文件名去扩展名；重名加 (2)(3) 后缀） */
  name: string;
  status: ItemStatus;
  /** 成功 = 已导入；失败/跳过 = 原因；ocr = 百分比 */
  detail?: string;
  progress?: number;
}
const ACCEPT_RE = /\.(pdf|docx|txt|md|markdown|text)$/i;

/**
 * 导入简历：粘贴文字，或上传 PDF / Word / txt，
 * 自动解析出「基本信息 + 各模块」，套用所选模板生成一份可直接编辑的简历。
 *
 * 上传文件支持多选：选 1 个走下面的单份预览流程；多选则进入批量模式 ——
 * 上传几个导入几份，逐份顺序解析（与本产品导出的 PDF 可 1:1 恢复，
 * 扫描件默认自动 OCR），每份独立成为一份简历。
 */
export function ImportResumeModal({
  open,
  onClose,
  onImported,
  onBatchFinished,
}: {
  open: boolean;
  onClose: () => void;
  /** 单份导入完成 / 批量里每份导入完成都会回调；batch 标记区分两种场景 */
  onImported: (resume: Resume, opts?: { batch?: boolean }) => void;
  /** 批量整批结束（成功 / 跳过 / 失败计数） */
  onBatchFinished?: (summary: { ok: number; skipped: number; failed: number }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const parseTimer = useRef<number | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? 'tpl-01');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  /** 选中的文件（图片型 PDF 需要用它来跑 OCR） */
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  /** 本产品导出的 PDF：里面嵌着整份简历的数据，可直接 1:1 原样恢复 */
  const [embedded, setEmbedded] = useState<Resume | null>(null);
  /** 需要 OCR：PDF 里没有可直接提取的文字 */
  const [needsOcr, setNeedsOcr] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  /** 批量模式：多选文件后的逐份导入列表（null = 单份 / 粘贴模式） */
  const [batchItems, setBatchItems] = useState<ImportItem[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchCurrent, setBatchCurrent] = useState<{ index: number; total: number; name: string } | null>(null);
  const [batchFinished, setBatchFinished] = useState<{ ok: number; skipped: number; failed: number } | null>(null);
  const [batchUseOcr, setBatchUseOcr] = useState(true);

  const reset = () => {
    setText('');
    setName('');
    setResult(null);
    setFileName('');
    setHint('');
    setBusy(false);
    setPickedFile(null);
    setEmbedded(null);
    setNeedsOcr(false);
    setOcrBusy(false);
    setOcrProgress(0);
    setOcrStatus('');
    setBatchItems(null);
    setBatchRunning(false);
    setBatchCurrent(null);
    setBatchFinished(null);
  };

  const close = () => {
    // 批量导入进行中不允许关闭（离屏解析与 store 逐份写入会断在半路）
    if (batchRunning) return;
    reset();
    onClose();
  };

  const doParse = (raw: string) => {
    if (!raw.trim()) {
      setResult(null);
      setHint('没有可解析的内容，请粘贴简历文字或上传文件。');
      return;
    }
    const parsed = parseResumeText(raw);
    setResult(parsed);
    setHint('');
    if (!name) {
      setName(parsed.basic.name ? `${parsed.basic.name}的简历` : '导入的简历');
    }
  };

  /** 文件名 → 默认简历名 */
  const nameFromFile = (f: File) => f.name.replace(/\.[^.]+$/, '');

  const onPickFile = async (file: File) => {
    setPickedFile(file);
    setBusy(true);
    setFileName(file.name);
    setNeedsOcr(false);
    setEmbedded(null);
    setHint('');
    const { text: content, hint: h, needsOcr: need, embedded: emb } = await readResumeFile(file);
    setBusy(false);
    setHint(h ?? '');
    setNeedsOcr(!!need);
    if (emb) {
      // 本产品导出的 PDF：整份数据都在，导入 = 原样恢复（模板选择没有意义）
      setEmbedded(emb);
      setText('');
      setResult(null);
      if (!name) setName(emb.name);
      return;
    }
    if (content.trim()) {
      setText(content);
      doParse(content);
      if (!name) setName(nameFromFile(file));
    } else {
      setResult(null);
    }
  };

  /** 图片型 PDF：渲染页面 → OCR */
  const runOcr = async () => {
    if (!pickedFile) return;
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus('准备中…');
    const { text: content, hint: h } = await ocrResumeFile(pickedFile, (p) => {
      setOcrProgress(p.progress);
      setOcrStatus(p.status);
    });
    setOcrBusy(false);
    setNeedsOcr(false);
    setHint(h ?? '');
    if (content.trim()) {
      setText(content);
      doParse(content);
      if (!name) setName(nameFromFile(pickedFile));
    } else {
      setResult(null);
    }
  };

  const confirm = () => {
    // 本产品导出的 PDF：直接原样恢复整份数据
    if (embedded) {
      onImported(resumeFromEmbedded(embedded, name));
      close();
      return;
    }
    // 直接在文本框里粘贴后马上点导入也能用：没解析过就现解析一次
    const parsed = result ?? (text.trim() ? parseResumeText(text) : null);
    if (!parsed) return;
    const resume = buildResumeFromImport(parsed, templateId, name.trim() || '导入的简历');
    onImported(resume);
    close();
  };

  /* --------------------------------- 批量导入 --------------------------------- */

  /** 加入批量列表：过滤不支持的格式，批内重名加后缀 */
  const addBatchFiles = (files: File[]) => {
    const accepted = files.filter((f) => ACCEPT_RE.test(f.name) || f.type.startsWith('text/'));
    const rejected = files.length - accepted.length;
    if (!accepted.length) {
      setHint('没有支持的文件（支持 .pdf / .docx / .txt / .md，可多选）');
      return;
    }
    setBatchItems((prev) => {
      const next = [...(prev ?? [])];
      const taken = new Set(next.map((i) => i.name));
      for (const f of accepted) {
        const base = f.name.replace(/\.[^.]+$/, '').trim() || '导入的简历';
        let name = base;
        let n = 1;
        while (taken.has(name)) {
          n += 1;
          name = `${base} (${n})`;
        }
        taken.add(name);
        next.push({ file: f, name, status: 'pending' });
      }
      return next;
    });
    setBatchFinished(null);
    setHint(rejected > 0 ? `已忽略 ${rejected} 个不支持的文件（仅支持 .pdf / .docx / .txt / .md）` : '');
  };

  /** 多选文件：>1 份进批量列表；=1 份走单份预览流程 */
  const onPickFiles = (files: File[]) => {
    if (files.length > 1) {
      // 清掉单份预览状态，进入批量模式
      setPickedFile(null);
      setEmbedded(null);
      setNeedsOcr(false);
      setResult(null);
      setText('');
      setFileName('');
      addBatchFiles(files);
      return;
    }
    if (files.length === 1) {
      setBatchItems(null);
      setBatchFinished(null);
      void onPickFile(files[0]);
    }
  };

  const patchItem = (file: File, p: Partial<ImportItem>) => {
    setBatchItems((prev) => (prev ?? []).map((i) => (i.file === file ? { ...i, ...p } : i)));
  };

  /** 批量里导入一份：与单份共用解析链（嵌入 1:1 / 文字解析 / OCR） */
  const importBatchOne = async (
    item: ImportItem,
  ): Promise<{ resume?: Resume; skipped?: string; error?: string }> => {
    patchItem(item.file, { status: 'reading', detail: undefined, progress: undefined });
    const { text, hint: readHint, needsOcr, embedded } = await readResumeFile(item.file);
    // 本产品导出的 PDF：整份数据 1:1 恢复（模板选择无意义）
    if (embedded) {
      return { resume: resumeFromEmbedded(embedded, item.name) };
    }
    let content = text;
    if (!content.trim() && needsOcr) {
      if (!batchUseOcr) {
        return { skipped: '图片型 PDF 需要文字识别（OCR），已按设置跳过' };
      }
      patchItem(item.file, { status: 'ocr', detail: '0%', progress: 0 });
      const ocr = await ocrResumeFile(item.file, (p) =>
        patchItem(item.file, {
          status: 'ocr',
          detail: `${Math.round(p.progress * 100)}%`,
          progress: p.progress,
        }),
      );
      if (!ocr.text.trim()) {
        return { error: ocr.hint || 'OCR 未识别出文字' };
      }
      content = ocr.text;
    }
    if (!content.trim()) {
      return { error: readHint || '没有可解析的内容' };
    }
    return { resume: buildResumeFromImport(parseResumeText(content), templateId, item.name) };
  };

  /** 批量导入：逐份顺序处理（OCR 很重不能并行），完成一份立即入库 */
  const runBatch = async () => {
    const list = (batchItems ?? []).filter((i) => i.status !== 'done');
    if (!list.length) return;
    setBatchRunning(true);
    setBatchFinished(null);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      setBatchCurrent({ index: i + 1, total: list.length, name: item.name });
      try {
        const r = await importBatchOne(item);
        if (r.resume) {
          onImported(r.resume, { batch: true });
          patchItem(item.file, { status: 'done', detail: '已导入', progress: undefined });
          ok += 1;
        } else if (r.skipped) {
          patchItem(item.file, { status: 'skipped', detail: r.skipped, progress: undefined });
          skipped += 1;
        } else {
          patchItem(item.file, { status: 'failed', detail: r.error || '导入失败', progress: undefined });
          failed += 1;
        }
      } catch (err) {
        patchItem(item.file, {
          status: 'failed',
          detail: err instanceof Error ? err.message : String(err),
          progress: undefined,
        });
        failed += 1;
      }
    }
    setBatchCurrent(null);
    const summary = { ok, skipped, failed };
    setBatchFinished(summary);
    setBatchRunning(false);
    onBatchFinished?.(summary);
  };

  /** 批量列表行的状态展示 */
  const batchStatusRow = (item: ImportItem) => {
    switch (item.status) {
      case 'pending':
        return { icon: <Clock className="h-3.5 w-3.5 text-ink-400" />, text: '等待中', cls: 'text-ink-400' };
      case 'reading':
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />,
          text: '解析中…',
          cls: 'text-brand-600',
        };
      case 'ocr':
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />,
          text: `文字识别 ${item.detail ?? '0%'}`,
          cls: 'text-amber-600',
        };
      case 'done':
        return { icon: <Check className="h-3.5 w-3.5 text-emerald-600" />, text: '已导入', cls: 'text-emerald-600' };
      case 'skipped':
        return { icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />, text: '已跳过', cls: 'text-amber-600' };
      case 'failed':
        return { icon: <X className="h-3.5 w-3.5 text-red-500" />, text: '失败', cls: 'text-red-600' };
    }
  };

  const tabCls = (active: boolean) =>
    cn(
      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
      active ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700',
    );

  return (
    <Modal
      open={open}
      onClose={close}
      title="导入简历"
      width={720}
      closable={!batchRunning}
      footer={
        batchItems ? (
          batchFinished ? (
            <Button onClick={close}>完成</Button>
          ) : batchRunning ? undefined : (
            <>
              <Button variant="outline" onClick={close}>
                取消
              </Button>
              <Button
                onClick={() => void runBatch()}
                disabled={!batchItems.some((i) => i.status !== 'done')}
              >
                <Upload className="h-4 w-4" />
                开始导入（{batchItems.filter((i) => i.status !== 'done').length}）
              </Button>
            </>
          )
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              取消
            </Button>
            <Button onClick={confirm} disabled={ocrBusy || (!embedded && !result && !text.trim())}>
              <Sparkles className="h-4 w-4" />
              解析并导入
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* 方式切换 */}
        <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
          <button
            type="button"
            className={tabCls(mode === 'paste')}
            onClick={() => setMode('paste')}
            disabled={batchRunning}
          >
            <FileUp className="h-4 w-4" />
            粘贴文本
          </button>
          <button
            type="button"
            className={tabCls(mode === 'file')}
            onClick={() => setMode('file')}
            disabled={batchRunning}
          >
            <Upload className="h-4 w-4" />
            上传文件
          </button>
        </div>

        {mode === 'paste' ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                setText(v);
                // 输入停顿 400ms 后自动解析，粘贴后无需再点别处
                window.clearTimeout(parseTimer.current);
                parseTimer.current = window.setTimeout(() => doParse(v), 400);
              }}
              onBlur={() => doParse(text)}
              placeholder={'把简历内容整段粘贴进来，例如：\n\n张三\n13800000000  zhangsan@example.com\n教育背景\n2020.09-2024.06   XX大学  计算机科学与技术\n工作经历\n2024.07-至今   XX科技   后端开发工程师\n- 负责 XX 系统开发……'}
              className="h-56 w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <p className="text-xs text-ink-400">
              小技巧：也可以切到「上传文件」直接上传 PDF / Word，系统会自动按版面还原文字并识别模块。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={batchRunning}
              className={cn(
                'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/60 text-ink-500 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700',
                batchRunning && 'pointer-events-none opacity-60',
              )}
            >
              {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
              <span className="text-sm font-medium">
                {fileName || '点击选择文件（支持 .pdf / .docx / .txt / .md，可多选）'}
              </span>
              <span className="text-xs text-ink-400">
                选一个 = 导入一份（可先预览）；多选 = 逐份批量导入，上传几个导入几份
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onPickFiles(files);
                e.target.value = '';
              }}
            />

            {/* 批量模式：多选文件后的逐份导入列表 */}
            {batchItems && batchItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {batchFinished && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="text-[13px] leading-relaxed text-emerald-800">
                      导入完成：成功 {batchFinished.ok} 份
                      {batchFinished.skipped > 0 && ` · 跳过 ${batchFinished.skipped} 份`}
                      {batchFinished.failed > 0 &&
                        ` · 失败 ${batchFinished.failed} 份（原因见下方列表，可再次开始导入）`}
                    </div>
                  </div>
                )}

                {batchRunning && batchCurrent && (
                  <div className="rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-[13px] text-ink-700">
                      <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                      <span className="min-w-0 truncate">
                        正在导入 {batchCurrent.index}/{batchCurrent.total}：
                        <span className="font-medium text-ink-900">{batchCurrent.name}</span>
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-200/70">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${((batchCurrent.index - 1) / batchCurrent.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-ink-100">
                  <div className="flex items-center justify-between border-b border-ink-50 px-3.5 py-2">
                    <span className="text-[13px] font-medium text-ink-600">
                      已选 {batchItems.length} 个文件
                      {batchFinished && ` · 本次成功 ${batchFinished.ok}`}
                    </span>
                    {!batchRunning && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchItems(null);
                          setBatchFinished(null);
                        }}
                        className="flex items-center gap-1 text-xs text-ink-400 transition hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        清空
                      </button>
                    )}
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {batchItems.map((item) => {
                      const row = batchStatusRow(item);
                      return (
                        <div
                          key={`${item.name}-${item.file.name}-${item.file.size}`}
                          className="border-b border-ink-50 px-3.5 py-2.5 last:border-b-0"
                        >
                          <div className="flex items-center gap-2.5">
                            {row.icon}
                            <span
                              className="min-w-0 flex-1 truncate text-sm text-ink-800"
                              title={item.file.name}
                            >
                              {item.name}
                            </span>
                            <span className={cn('shrink-0 text-xs', row.cls)}>{row.text}</span>
                          </div>
                          {item.status === 'ocr' && (
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-amber-200/70">
                              <div
                                className="h-full rounded-full bg-amber-500 transition-[width] duration-200"
                                style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }}
                              />
                            </div>
                          )}
                          {(item.status === 'failed' || item.status === 'skipped') && item.detail && (
                            <p className="mt-1 text-xs leading-relaxed text-ink-400">{item.detail}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 图片型 PDF → 文字识别 */}
        {needsOcr && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <ScanText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-800">这是图片版 PDF，需要文字识别</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  页面内容是一张张图片，里面没有文字对象，所以要靠 OCR 把字读出来。
                  识别简体中文约需十几秒到一分钟（首次会先加载识别引擎，之后走缓存）。
                </p>
                {ocrBusy ? (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70">
                      <div
                        className="h-full rounded-full bg-amber-600 transition-[width] duration-200"
                        style={{ width: `${Math.round(ocrProgress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {ocrStatus || '识别中…'}（{Math.round(ocrProgress * 100)}%）
                    </p>
                  </div>
                ) : (
                  <Button size="sm" className="mt-3" onClick={() => void runOcr()}>
                    <ScanText className="h-3.5 w-3.5" />
                    开始文字识别（OCR）
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 本产品导出的 PDF：完整数据恢复 */}
        {embedded && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-800">
                  检测到 Resume-Pan 导出的完整数据
                </p>
                <p className="mt-1 text-xs leading-relaxed text-brand-700">
                  这份 PDF 由 Resume-Pan 导出，里面带着完整的简历数据 ——
                  导入后会<b>原样恢复</b>：{embedded.sections.filter((s) => s.visible).length} 个模块
                  、排版格式、主题色与模板全部保持一致，无需重新整理。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 解析结果（嵌入模式不需要） */}
        {!embedded && result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              解析完成：识别到 {result.summary.sections} 个模块
              {result.summary.items > 0 && ` · ${result.summary.items} 条经历`}
              {result.summary.detectedBasic.length > 0 &&
                ` · ${result.summary.detectedBasic.join('、')}`}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.sections.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] text-ink-600 shadow-sm"
                >
                  {s.title}
                  {s.kind === 'list' && s.items.length ? `(${s.items.length})` : ''}
                </span>
              ))}
            </div>
            {result.fallback && (
              <p className="mt-2 text-xs text-amber-600">
                没有识别到常见章节标题，已把整篇内容放进「简历内容」模块，可在编辑器里再整理。
              </p>
            )}
          </div>
        )}

        {hint && !ocrBusy && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{hint}</span>
          </div>
        )}

        {/* 名称与模板（批量模式名称取文件名；嵌入模式自带模板与排版，不需要选） */}
        <div className={cn('grid gap-3', embedded || batchItems ? 'sm:grid-cols-1' : 'sm:grid-cols-2')}>
          {!batchItems && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-500">简历名称</span>
              <TextInput
                autoFocus
                value={name}
                placeholder="例如：张三的简历"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {!embedded && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-500">
                {batchItems ? '套用模板（对批量解析导入的文件生效）' : '套用模板'}
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={batchRunning}
                className="h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.styleName} · {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* 批量模式：扫描件 OCR 开关 */}
        {batchItems && (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={batchUseOcr}
              onChange={(e) => setBatchUseOcr(e.target.checked)}
              disabled={batchRunning}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span className="text-[13px] leading-relaxed text-ink-600">
              扫描件自动文字识别（OCR）
              <span className="block text-xs text-ink-400">
                关闭后，图片型 PDF 会标记为「跳过」；识别较慢，请耐心等待
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

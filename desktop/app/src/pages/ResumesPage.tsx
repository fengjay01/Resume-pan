import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  Check,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  Hand,
  ListChecks,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Dropdown, EmptyState, MenuItem } from '@/components/common/Misc';
import { TextInput } from '@/components/common/Form';
import { useResumeStore } from '@/store/resumeStore';
import { cn } from '@/lib/cn';
import type { Resume } from '@/types/resume';
import { TRASH_RETENTION_DAYS } from '@/types/resume';
import { ResumeCard, ViewToggle } from '@/components/site/ResumeCard';
import { BatchExportModal } from '@/components/site/BatchExportModal';
import { ImportResumeModal } from '@/components/site/ImportResumeModal';
import { BatchDeleteModal } from '@/components/site/BatchDeleteModal';

/** 排序模式：custom = 拖拽自定义顺序（数组原序），其余按字段 + 方向 */
type SortKey = 'custom' | 'name' | 'updatedAt';
type SortDir = 'asc' | 'desc';
const SORT_STORAGE_KEY = 'xl-resume-sort';

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || '');
    if (raw && ['custom', 'name', 'updatedAt'].includes(raw.key) && ['asc', 'desc'].includes(raw.dir))
      return raw;
  } catch {
    /* 忽略损坏数据 */
  }
  return { key: 'custom', dir: 'desc' };
}

/** 拖拽会话状态：放在 ref 里，pointermove 不触发 React 渲染（只直接改样式，保证 60fps 跟手） */
interface DragSession {
  id: string;
  /** 指针相对卡片左上角的抓取偏移 */
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** 当前位移（相对卡片布局位置） */
  tx: number;
  ty: number;
  /** 拖拽卡片中心（判定目标插入位用） */
  cx: number;
  cy: number;
  /** 是否已越过启动阈值（真正进入拖拽，避免误触） */
  moved: boolean;
  scrollRaf: number | null;
  /** 上一次采样时间与采样点（只由 applyFloat 更新，用于算速度） */
  lastT: number;
  sampleX: number;
  sampleY: number;
  /** 平滑后的指针速度（px/ms）：动画时长/倾斜角都跟着它变 */
  v: number;
  /** 平滑后的水平速度（px/ms）：决定抬起时往哪边倾 */
  vx: number;
  /** 抬起层元素（旋转角逐帧更新，不走 React） */
  inner: HTMLDivElement | null;
}

export default function ResumesPage() {
  const navigate = useNavigate();
  const resumes = useResumeStore((s) => s.resumes);
  const rename = useResumeStore((s) => s.rename);
  const duplicate = useResumeStore((s) => s.duplicate);
  const remove = useResumeStore((s) => s.remove);
  const purgeNow = useResumeStore((s) => s.purgeNow);
  const addResume = useResumeStore((s) => s.add);
  const trashedCount = useResumeStore((s) => s.trashed.length);
  const purgeExpired = useResumeStore((s) => s.purgeExpired);
  const setOrderWithPins = useResumeStore((s) => s.setOrderWithPins);
  const togglePin = useResumeStore((s) => s.togglePin);

  const [mode, setMode] = useState<'grid' | 'list'>('list');
  const [sort, setSort] = useState(loadSort);
  const [renameTarget, setRenameTarget] = useState<Resume | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  /* 排序偏好持久化（自定义顺序 = 拖拽结果本身已存在简历数组里，无需另存） */
  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  }, [sort]);

  /* 回收站过期项清理：进入页面清一遍，长时间停留时每 10 分钟再清一遍 */
  useEffect(() => {
    purgeExpired();
    const timer = window.setInterval(() => purgeExpired(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [purgeExpired]);

  /**
   * 排序后的展示列表：**置顶组永远在最前**（数量不限），组内保持数组原序（= 拖拽可调），
   * 其余按当前排序键排。custom 模式整表都用数组原序（拖拽结果）。
   */
  const sorted = useMemo(() => {
    let list = resumes;
    if (sort.key !== 'custom') {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...resumes].sort((a, b) => {
        if (sort.key === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN') * dir;
        return (a.updatedAt - b.updatedAt) * dir;
      });
    }
    const pinned = list.filter((r) => r.pinned);
    const rest = list.filter((r) => !r.pinned);
    return pinned.length ? [...pinned, ...rest] : list;
  }, [resumes, sort]);
  const dragEnabled = sort.key === 'custom';

  /* ------------ 指针拖拽排序：卡片跟手浮动 + 其余卡片平滑让位（FLIP） ------------ */
  /** 拖拽中的简历 id（用于「抬起」样式） */
  const [dragId, setDragId] = useState<string | null>(null);
  /** 拖拽期间的临时顺序（id 列表），松手提交到 store 后清空 */
  const [viewIds, setViewIds] = useState<string[] | null>(null);
  const viewIdsRef = useRef<string[] | null>(null);
  /** 每张卡片的「位移层」：跟手位移与 FLIP 让位动画都作用在这一层  */
  const layers = useRef<Map<string, HTMLDivElement>>(new Map());
  /** 上一次渲染完成时的卡片位置，用于计算 FLIP 起点 */
  const prevRects = useRef<Map<string, DOMRect> | null>(null);
  /** 位移由代码手动接管的卡片（拖拽中 / 落位动画中）：FLIP 不参与，避免互相打架 */
  const manualIds = useRef<Set<string>>(new Set());
  const dragRef = useRef<DragSession | null>(null);
  const timers = useRef<number[]>([]);
  /** 松手后待执行的落位动画参数（在 commit 之后的 layoutEffect 里消费） */
  const pendingDrop = useRef<{
    id: string;
    tx: number;
    ty: number;
    v: number;
    prevRect: DOMRect;
  } | null>(null);

  /** 拖拽期间的展示列表：按临时顺序映射 */
  const displayResumes = useMemo(() => {
    if (!viewIds) return sorted;
    const map = new Map(sorted.map((r) => [r.id, r] as const));
    return viewIds.map((id) => map.get(id)).filter(Boolean) as Resume[];
  }, [sorted, viewIds]);

  /**
   * 把拖拽卡片贴合到指针下。
   * 位移是相对「布局位置」的，而顺序变化会让布局位置改变 ——
   * 所以每次都从当前 rect 反推出布局位置再算位移，保证全程 1:1 跟手不跳。
   */
  /**
   * 取卡片的**布局位置**（不含位移层上的 translate）。
   *
   * 坑：`getBoundingClientRect()` 会把 transform 一起算进去。拖拽/让位动画期间卡片带着
   * translate，如果直接记录 rect 当基线，动画结束、位移清零之后，下一次渲染再比对时
   * 就会算出一个「凭空多出来的位移」——表现为**排序完成一会儿之后卡片又自己动一下**
   * （像是重新布局）。所以这里把当前 translate 扣掉，只记真实布局位置。
   */
  const layoutRectOf = (el: HTMLElement): DOMRect => {
    const rect = el.getBoundingClientRect();
    const m = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(el.style.transform || '');
    if (!m) return rect;
    const dx = Number(m[1]) || 0;
    const dy = Number(m[2]) || 0;
    if (!dx && !dy) return rect;
    return new DOMRect(rect.left - dx, rect.top - dy, rect.width, rect.height);
  };

  /**
   * 当前「有效速度」：速度按时间指数衰减。
   * 指针一停下来（没有新的移动事件）速度就迅速归零 —— 这样快拖之后慢下来微调时，
   * 提前量与动画时长都会立刻回到「精确、从容」的状态，不会因为刚才拖得快而放不准位置。
   */
  const effV = (s: DragSession) => s.v * Math.exp(-(performance.now() - s.lastT) / 90);

  const applyFloat = (cx: number, cy: number) => {
    const s = dragRef.current;
    if (!s) return;
    const layer = layers.current.get(s.id);
    if (!layer) return;

    // 速度采样（指数平滑）：拖得越快，抬起角度越大、让位动画越干脆
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    const dx = cx - s.sampleX;
    const dy = cy - s.sampleY;
    const inst = Math.hypot(dx, dy) / dt;
    s.v = s.v * 0.7 + inst * 0.3;
    s.vx = s.vx * 0.7 + (dx / dt) * 0.3;
    s.lastT = now;
    s.sampleX = cx;
    s.sampleY = cy;

    const r = layer.getBoundingClientRect();
    const layoutLeft = r.left - s.tx;
    const layoutTop = r.top - s.ty;
    s.tx = cx - s.grabX - layoutLeft;
    s.ty = cy - s.grabY - layoutTop;
    s.cx = layoutLeft + s.tx + r.width / 2;
    s.cy = layoutTop + s.ty + r.height / 2;
    layer.style.transition = 'none';
    layer.style.transform = `translate3d(${s.tx}px, ${s.ty}px, 0)`;
    layer.style.willChange = 'transform';

    // 抬起层：快速拖动时朝运动方向轻微倾斜（最多 ±3.5°），慢下来自动回正
    if (s.inner) {
      const tilt = Math.max(-2.2, Math.min(2.2, s.vx * 2.4));
      s.inner.style.transform = `scale(1.02) rotate(${tilt.toFixed(2)}deg)`;
    }
  };

  /**
   * 依据拖拽卡片中心，算出它应该插到第几位。
   * 判据是「中心越过邻居中心」而不是「离谁最近」——前者才是直觉上的换位时机，
   * 后者会让卡片刚拖起一点点就立刻跳位（显得生硬）。列表按纵轴比、网格按行优先比。
   */
  const resolveOrder = () => {
    const s = dragRef.current;
    const ids = viewIdsRef.current;
    if (!s || !ids) return;
    const dragged = layers.current.get(s.id);
    const tol = mode === 'list' ? 0 : (dragged?.getBoundingClientRect().height ?? 0) * 0.5;
    // 快速拖动时略提前换位（最多 24px）：拖得快说明意图明确，不必等中心完全越线；
    // 一旦慢下来（速度归零）立即回到精确判定，保证能放到想要的位置。
    const lead = Math.min(effV(s) * 30, 24);
    const others = ids.filter((x) => x !== s.id);
    let insertAt = 0;
    for (let i = 0; i < others.length; i += 1) {
      const el = layers.current.get(others[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const ocy = r.top + r.height / 2;
      const ocx = r.left + r.width / 2;
      // 该卡片排在拖拽卡片之前？
      const before =
        s.cy > ocy + tol - lead || (tol > 0 && Math.abs(s.cy - ocy) <= tol && s.cx > ocx);
      if (before) insertAt += 1;
    }
    const next = [...others];
    next.splice(insertAt, 0, s.id);
    if (next.some((x, i) => ids[i] !== x)) {
      viewIdsRef.current = next;
      setViewIds(next);
    }
  };

  /* 落位动画：顺序提交后，把「浮动位置」平滑归零，卡片滑入最终槽位。
     注意：这里不能加依赖数组 —— 必须在「松手导致的那次重渲染」之后立刻执行。 */
  useLayoutEffect(() => {
    const pd = pendingDrop.current;
    if (!pd) return;
    pendingDrop.current = null;
    const el = layers.current.get(pd.id);
    if (!el) return;
    // 布局已切到最终槽位，先按「布局位移差」修正起点，保证视觉位置连续
    const cur = el.getBoundingClientRect();
    const fixX = pd.tx + (pd.prevRect.left - cur.left);
    const fixY = pd.ty + (pd.prevRect.top - cur.top);
    el.style.transition = 'none';
    el.style.transform = `translate3d(${fixX}px, ${fixY}px, 0)`;
    void el.offsetWidth; // 强制回流：让下面的过渡真的从当前位置开始
    // 落位时长随拖拽速度：甩得快 → 干脆利落；慢慢放开 → 更柔和
    const dropMs = Math.round(Math.min(340, Math.max(200, 340 - pd.v * 140)));
    const raf = requestAnimationFrame(() => {
      el.style.transition = `transform ${dropMs}ms cubic-bezier(.16,1,.3,1)`;
      el.style.transform = 'translate3d(0, 0, 0)';
    });
    const timer = window.setTimeout(() => {
      window.cancelAnimationFrame(raf);
      el.style.transition = '';
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.willChange = '';
      const inner = el.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = '';
      manualIds.current.delete(pd.id);
    }, 400);
    timers.current.push(timer);
  });

  /* FLIP：顺序/布局变化后，其余卡片从旧位置平滑滑到新位置（不生硬跳变） */
  useLayoutEffect(() => {
    // 拖拽中：顺序变化会让布局位移，先用新布局重算跟手位移，避免卡片“跳一下”
    const s = dragRef.current;
    if (s && s.moved) applyFloat(s.lastX, s.lastY);

    const next = new Map<string, DOMRect>();
    layers.current.forEach((el, id) => next.set(id, layoutRectOf(el)));
    const prev = prevRects.current;
    prevRects.current = next;
    if (!prev) return;

    next.forEach((rect, id) => {
      if (manualIds.current.has(id)) return;
      const p = prev.get(id);
      const el = layers.current.get(id);
      if (!p || !el) return;
      const dx = p.left - rect.left;
      const dy = p.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      el.style.willChange = 'transform';
      // 让位时长随拖动速度：拖得越快，邻居让位越干脆（下限 120ms，避免快到看不清落点）
      const speed = dragRef.current ? effV(dragRef.current) : 0;
      const moveMs = Math.round(Math.min(280, Math.max(120, 280 - speed * 160)));
      const raf = requestAnimationFrame(() => {
        el.style.transition = `transform ${moveMs}ms cubic-bezier(.22,1,.36,1)`;
        el.style.transform = 'translate3d(0, 0, 0)';
        const timer = window.setTimeout(() => {
          if (manualIds.current.has(id)) return;
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
          // 动画结束后基线与真实布局对齐，避免下次渲染凭空再动一下
          prevRects.current?.set(id, layoutRectOf(el));
        }, 320);
        timers.current.push(timer);
        if (timers.current.length > 240) timers.current = timers.current.slice(-60);
      });
      timers.current.push(raf);
    });
  });

  useEffect(
    () => () => {
      timers.current.forEach((t) => {
        window.clearTimeout(t);
        window.cancelAnimationFrame(t);
      });
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [],
  );

  const startDrag = (id: string, e: React.PointerEvent) => {
    if (!dragEnabled || e.button !== 0) return;
    // 卡片内的按钮/链接照常工作，不进入拖拽
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    const layer = layers.current.get(id);
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const ids0 = sorted.map((r) => r.id);
    viewIdsRef.current = ids0;
    dragRef.current = {
      id,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      tx: 0,
      ty: 0,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      moved: false,
      scrollRaf: null,
      lastT: performance.now(),
      sampleX: e.clientX,
      sampleY: e.clientY,
      v: 0,
      vx: 0,
      inner: null,
    };
    // 立刻禁止选中文本：按住时还不确定是点击还是拖拽，先避免拖出蓝色选区
    document.body.style.userSelect = 'none';

    /** 拖到视口上下边缘时自动滚动（滚动后重新贴合指针并重算目标位） */
    const scrollLoop = () => {
      const s = dragRef.current;
      if (!s) return;
      const margin = 130;
      let v = 0;
      if (s.lastY < margin) v = -Math.ceil((margin - s.lastY) / 5);
      else if (s.lastY > window.innerHeight - margin)
        v = Math.ceil((s.lastY - (window.innerHeight - margin)) / 5);
      if (v !== 0) {
        window.scrollBy(0, v);
        applyFloat(s.lastX, s.lastY);
        resolveOrder();
      }
      s.scrollRaf = requestAnimationFrame(scrollLoop);
    };

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      s.lastX = ev.clientX;
      s.lastY = ev.clientY;
      if (!s.moved) {
        // 小于阈值视为点击，不进入拖拽（避免误触）
        if (Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) < 4) return;
        s.moved = true;
        manualIds.current.add(s.id);
        s.inner = (layer.firstElementChild as HTMLDivElement) ?? null;
        setDragId(s.id);
        setViewIds(ids0);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        layer.style.zIndex = '30';
        s.scrollRaf = requestAnimationFrame(scrollLoop);
      }
      applyFloat(ev.clientX, ev.clientY);
      resolveOrder();
    };

    const onScroll = () => {
      const s = dragRef.current;
      if (!s || !s.moved) return;
      applyFloat(s.lastX, s.lastY);
      resolveOrder();
    };

    const onUp = () => {
      const s = dragRef.current;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      window.removeEventListener('scroll', onScroll, true);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      dragRef.current = null;
      if (s?.scrollRaf) window.cancelAnimationFrame(s.scrollRaf);

      const finalIds = viewIdsRef.current;
      viewIdsRef.current = null;
      if (!s || !s.moved) return; // 只是点击，没有拖拽

      // 记下浮动位置：顺序提交后由 layoutEffect 平滑归零
      pendingDrop.current = {
        id: s.id,
        tx: s.tx,
        ty: s.ty,
        v: effV(s),
        prevRect: layer.getBoundingClientRect(),
      };
      // 抬起层（缩放/倾斜是拖拽时逐帧写上去的内联样式）：松手必须清掉，
      // 否则卡片会带着 1.025 倍缩放和倾斜角留在列表里（看起来整排都歪了）。
      if (s.inner) s.inner.style.transform = '';
      manualIds.current.add(s.id);
      setDragId(null);
      setViewIds(null);

      if (finalIds) {
        const current = useResumeStore.getState().resumes;
        const cur = current.map((r) => r.id);
        // 拖到置顶区里/外 → 自动置顶 / 自动取消置顶（置顶区就是列表最前面那一段）
        const pinSet = new Set(current.filter((r) => r.pinned).map((r) => r.id));
        const wasPinned = pinSet.has(s.id);
        const unpinnedOthers = finalIds.filter((id) => id !== s.id && !pinSet.has(id));
        const firstUnpinned = unpinnedOthers.length
          ? Math.min(...unpinnedOthers.map((id) => finalIds.indexOf(id)))
          : Number.POSITIVE_INFINITY;
        const nowPinned = finalIds.indexOf(s.id) < firstUnpinned;
        const pinnedIds = [...pinSet].filter((id) => id !== s.id);
        if (nowPinned) pinnedIds.push(s.id);

        const orderChanged = finalIds.some((x, i) => cur[i] !== x);
        const pinChanged = wasPinned !== nowPinned;
        if (orderChanged || pinChanged) {
          setOrderWithPins(finalIds, pinnedIds);
          setToast(
            pinChanged ? (nowPinned ? '已置顶' : '已取消置顶') : '已调整顺序',
          );
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    window.addEventListener('scroll', onScroll, true);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openRename = useCallback((resume: Resume) => {
    setRenameTarget(resume);
    setRenameValue(resume.name);
  }, []);

  const handleDuplicate = useCallback(
    (resume: Resume) => {
      duplicate(resume.id);
      setToast('已复制简历');
    },
    [duplicate],
  );

  /**
   * 卡片动作集合：必须保持引用稳定，否则 ResumeCard 的 memo 失效 ——
   * 拖拽换位时每张卡片都会重新渲染整份简历缩略图（两趟量测 + 分页），
   * 这正是拖拽卡顿的根源。
   */
  const actions = useMemo(
    () => ({
      onEdit: (resume: Resume) => navigate(`/editor/${resume.id}`),
      onRename: openRename,
      onDuplicate: handleDuplicate,
      onDelete: (resume: Resume) => setDeleteTarget(resume),
      onTogglePin: (resume: Resume) => {
        togglePin(resume.id);
        setToast(resume.pinned ? '已取消置顶' : '已置顶');
      },
    }),
    [navigate, openRename, handleDuplicate, togglePin],
  );

  const confirmRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (name) rename(renameTarget.id, name);
    setRenameTarget(null);
    setToast('已重命名');
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove(deleteTarget.id);
    setDeleteTarget(null);
    setToast('已移入回收站，30 天内可恢复');
  };

  /** 不进回收站，直接永久删除 */
  const confirmPurgeNow = () => {
    if (!deleteTarget) return;
    purgeNow(deleteTarget.id);
    setDeleteTarget(null);
    setToast('已彻底删除');
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      {/* 顶部统计卡 */}
      <div className="flex flex-col gap-5 rounded-2xl border border-ink-100 bg-white p-6 shadow-card md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-end gap-3">
            <span className="text-[34px] font-bold leading-none tracking-tight text-ink-900">
              共 {resumes.length} 份简历
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-500">
            管理您的所有简历，随时编辑和导出专业的求职简历
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Dropdown
            trigger={
              <Button variant="outline">
                <ArrowDownWideNarrow className="h-4 w-4" />
                排序
              </Button>
            }
          >
            <MenuItem
              icon={<Hand className="h-4 w-4" />}
              active={sort.key === 'custom'}
              onClick={() => setSort({ key: 'custom', dir: 'desc' })}
            >
              自定义排序（拖拽）
            </MenuItem>
            <MenuItem
              icon={<ArrowUpNarrowWide className="h-4 w-4" />}
              active={sort.key === 'name' && sort.dir === 'asc'}
              onClick={() => setSort({ key: 'name', dir: 'asc' })}
            >
              按名称 递增
            </MenuItem>
            <MenuItem
              icon={<ArrowDownWideNarrow className="h-4 w-4" />}
              active={sort.key === 'name' && sort.dir === 'desc'}
              onClick={() => setSort({ key: 'name', dir: 'desc' })}
            >
              按名称 递减
            </MenuItem>
            <MenuItem
              icon={<ArrowDownWideNarrow className="h-4 w-4" />}
              active={sort.key === 'updatedAt' && sort.dir === 'desc'}
              onClick={() => setSort({ key: 'updatedAt', dir: 'desc' })}
            >
              按修改时间 从新到旧
            </MenuItem>
            <MenuItem
              icon={<ArrowUpNarrowWide className="h-4 w-4" />}
              active={sort.key === 'updatedAt' && sort.dir === 'asc'}
              onClick={() => setSort({ key: 'updatedAt', dir: 'asc' })}
            >
              按修改时间 从旧到新
            </MenuItem>
          </Dropdown>
          <ViewToggle mode={mode} onChange={setMode} />
          {/* 批量操作（导出/导入/删除）收进一个下拉，减少工具栏按钮数量 */}
          <Dropdown
            trigger={
              <Button variant="outline">
                <ListChecks className="h-4 w-4" />
                批量操作
                <ChevronDown className="h-4 w-4 text-ink-400" />
              </Button>
            }
          >
            <MenuItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => setBatchExportOpen(true)}
            >
              批量导出
            </MenuItem>
            <MenuItem
              icon={<Upload className="h-4 w-4" />}
              onClick={() => setImportOpen(true)}
            >
              批量导入
            </MenuItem>
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              danger
              onClick={() => setBatchDeleteOpen(true)}
            >
              批量删除
            </MenuItem>
          </Dropdown>
          <Button variant="outline" onClick={() => navigate('/resumes/trash')}>
            <Trash2 className="h-4 w-4" />
            回收站
            {trashedCount > 0 && (
              <span className="ml-0.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-ink-600">
                {trashedCount}
              </span>
            )}
          </Button>
          <Button onClick={() => navigate('/templates')}>
            <Plus className="h-4 w-4" />
            新增简历
          </Button>
        </div>
      </div>

      {/* 简历列表 */}
      {resumes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="还没有简历"
            description="从精选模板开始，几步就能生成一份专业的求职简历。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => navigate('/templates')}>
                  <Plus className="h-4 w-4" />
                  新增简历
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" />
                  导入已有简历
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {dragEnabled ? (
            <p className="mt-6 flex items-center gap-1.5 text-[13px] text-ink-400">
              <GripVertical className="h-3.5 w-3.5" />
              按住卡片拖拽调整顺序；拖到最前自动置顶，置顶数量不限（顺序自动保存）
            </p>
          ) : (
            <p className="mt-6 flex items-center gap-1.5 text-[13px] text-ink-400">
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              {sort.key === 'name'
                ? `已按名称${sort.dir === 'asc' ? '递增' : '递减'}排序`
                : `已按修改时间${sort.dir === 'desc' ? '从新到旧' : '从旧到新'}排序`}
              ，切换到「自定义排序」可拖拽调整
            </p>
          )}
          {mode === 'list' ? (
            <div className="mt-4 flex flex-col gap-5">
              {displayResumes.map((resume) => {
                const dragging = dragId === resume.id;
                return (
                  <div
                    key={resume.id}
                    ref={(el) => {
                      if (el) layers.current.set(resume.id, el);
                      else layers.current.delete(resume.id);
                    }}
                    onPointerDown={(e) => startDrag(resume.id, e)}
                    data-resume-id={resume.id}
                    className={cn('relative', dragEnabled && 'cursor-grab', dragging && 'z-30')}
                    title={dragEnabled ? '按住拖拽调整顺序' : undefined}
                  >
                    {/* 抬起层：拖拽时轻微放大 + 随速度倾斜 + 投影（transform 由指针速度逐帧驱动） */}
                    <div
                      className={cn(
                        'transition-[transform,box-shadow] duration-150 ease-out',
                        dragging &&
                          'pointer-events-none shadow-[0_24px_50px_-14px_rgba(16,24,40,.45)]',
                      )}
                    >
                      {dragEnabled && (
                        <span className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-ink-300 md:block">
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      <ResumeCard resume={resume} mode="list" actions={actions} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayResumes.map((resume) => {
                const dragging = dragId === resume.id;
                return (
                  <div
                    key={resume.id}
                    ref={(el) => {
                      if (el) layers.current.set(resume.id, el);
                      else layers.current.delete(resume.id);
                    }}
                    onPointerDown={(e) => startDrag(resume.id, e)}
                    data-resume-id={resume.id}
                    className={cn('relative', dragEnabled && 'cursor-grab', dragging && 'z-30')}
                    title={dragEnabled ? '按住拖拽调整顺序' : undefined}
                  >
                    {/* 抬起层：拖拽时轻微放大 + 随速度倾斜 + 投影（transform 由指针速度逐帧驱动） */}
                    <div
                      className={cn(
                        'transition-[transform,box-shadow] duration-150 ease-out',
                        dragging &&
                          'pointer-events-none shadow-[0_26px_55px_-16px_rgba(16,24,40,.5)]',
                      )}
                    >
                      <ResumeCard resume={resume} mode="grid" actions={actions} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 批量导出：多选简历，两种导出方式与单份导出一致，可选保存文件夹 */}
      <BatchExportModal
        open={batchExportOpen}
        onClose={() => setBatchExportOpen(false)}
        resumes={resumes}
      />

      {/* 导入简历：单份（粘贴/上传，带解析预览）或多文件批量（上传几个导入几份） */}
      <ImportResumeModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(resume, opts) => {
          addResume(resume);
          // 批量导入逐份入库，不跳编辑器；单份导入保持原有「导入后打开编辑器」
          if (opts?.batch) return;
          setToast('已导入，正在打开编辑器');
          window.setTimeout(() => navigate(`/editor/${resume.id}`), 350);
        }}
        onBatchFinished={(s) =>
          setToast(
            `批量导入完成：成功 ${s.ok} 份${s.skipped ? ` · 跳过 ${s.skipped} 份` : ''}${
              s.failed ? ` · 失败 ${s.failed} 份` : ''
            }`,
          )
        }
      />

      {/* 批量删除：多选后移入回收站（可恢复）或彻底删除（两步确认，不可恢复） */}
      <BatchDeleteModal
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        resumes={resumes}
        onTrashed={(n) => setToast(`已把 ${n} 份简历移入回收站，${TRASH_RETENTION_DAYS} 天内可恢复`)}
        onPurged={(n) => setToast(`已彻底删除 ${n} 份简历`)}
      />

      {/* 重命名 */}
      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="重命名简历"
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmRename}>确定</Button>
          </>
        }
      >
        <TextInput
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmRename();
          }}
          placeholder="请输入简历名称"
        />
      </Modal>

      {/* 删除确认：默认进回收站（可恢复），也提供「彻底删除」（不可恢复） */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="删除简历"
        width={460}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={confirmPurgeNow}
            >
              <Trash2 className="h-4 w-4" />
              彻底删除
            </Button>
            <Button onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" />
              移入回收站
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-ink-600">
          将把
          <span className="mx-1 font-medium text-ink-800">{deleteTarget?.name}</span>
          <span className="text-emerald-700">移入回收站</span>
          ，{TRASH_RETENTION_DAYS} 天内可以随时恢复，到期后自动彻底删除。
          <p className="mt-2 text-xs text-ink-400">
            也可以选择「彻底删除」，不经过回收站直接永久删除，此操作不可恢复。
          </p>
        </div>
      </Modal>

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

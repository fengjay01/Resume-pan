import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, FileDown, FileWarning, ImageDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/Modal';
import { Dropdown, EmptyState, MenuItem } from '@/components/common/Misc';
import { ResumeRenderer } from '@/components/resume';
import { buildTokens } from '@/components/resume/tokens';
import { useAuthStore } from '@/store/auth';
import { useResumeStore } from '@/store/resumeStore';
import { useEditorTabsStore } from '@/store/editorTabs';
import { createSection } from '@/lib/resume';
import { exportResumePdf, printResume } from '@/lib/export';
import { exportViaService } from '@/lib/serverExport';
import { EXPORT_BUILD_ID } from '@/lib/version';
import { cn } from '@/lib/cn';
import { A4_WIDTH } from '@/data/design';
import type {
  BasicInfo,
  ModuleType,
  Resume,
  ResumeSection,
  ResumeStyle,
  SpacingConfig,
} from '@/types/resume';
import { BasicInfoForm } from '@/components/editor/BasicInfoForm';
import { ItemSectionForm } from '@/components/editor/ItemSectionForm';
import { RichSectionForm } from '@/components/editor/RichSectionForm';
import { ModuleNav, BASIC_MODULE_ID } from '@/components/editor/ModuleNav';
import { SettingPanel } from '@/components/editor/SettingPanel';
import { PreviewPane, type PreviewHandle } from '@/components/editor/PreviewPane';
import { GuideBanner } from '@/components/editor/fields';
import { MODULE_GUIDE, type SettingTab } from '@/components/editor/editorOptions';

/** 等待浏览器完成一轮渲染（供智能一页重新分页后测量） */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 40);
      });
    });
  });
}

export default function EditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const resume = useResumeStore((s) => s.resumes.find((r) => r.id === id));
  const saveStatus = useResumeStore((s) => s.saveStatus);
  const update = useResumeStore((s) => s.update);
  const rename = useResumeStore((s) => s.rename);
  // 编辑器里的「模板」面板是按风格切换，只换外观、不动模块顺序
  const switchStyle = useResumeStore((s) => s.switchStyle);
  const setSaveStatus = useResumeStore((s) => s.setSaveStatus);

  /** 编辑区笔记字体/字号用与纸张一致的令牌，保证编辑与预览格式一致 */
  const editorStyleVars = useMemo(() => {
    if (!resume) return undefined;
    const t = buildTokens(resume.style);
    return {
      '--resume-font': t.fontFamily,
      '--resume-fs': `${t.fs}px`,
      '--resume-line-height': String(t.lineHeight),
      '--resume-content-width': `${A4_WIDTH - t.marginX * 2}px`,
    } as React.CSSProperties;
  }, [resume?.style]);

  const [tab, setTab] = useState<SettingTab>('template');
  // 侧边栏默认收起（只保留图标竖栏），单击图标展开 / 再击收起
  const [collapsed, setCollapsed] = useState(true);
  const [activeId, setActiveId] = useState<string>(BASIC_MODULE_ID);
  const [pageCount, setPageCount] = useState(1);
  const [compressing, setCompressing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ResumeSection | null>(null);
  /** 下方编辑面板是否收起（收起后预览区占满剩余高度） */
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  /** 预览区高度（px）；null = 默认 46vh。由拖拽分隔条调整 */
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  /* ------------------------- 多标签页：多份简历间快速切换 ------------------------- */
  const resumes = useResumeStore((s) => s.resumes);
  const tabs = useEditorTabsStore((s) => s.tabs);
  const openTab = useEditorTabsStore((s) => s.open);
  const closeTab = useEditorTabsStore((s) => s.close);
  const closeAllTabs = useEditorTabsStore((s) => s.closeAll);
  const reorderTabs = useEditorTabsStore((s) => s.reorder);

  /** 当前简历自动进标签条（所有进入编辑器的入口都由此覆盖） */
  useEffect(() => {
    if (id) openTab(id);
  }, [id, openTab]);

  /** 只显示仍然存在的简历；被删除的自动从标签条清理 */
  const openTabs = useMemo(() => {
    const ids = new Set(resumes.map((r) => r.id));
    return tabs.filter((t) => ids.has(t));
  }, [tabs, resumes]);
  useEffect(() => {
    const missing = tabs.filter((t) => !openTabs.includes(t));
    missing.forEach((t) => closeTab(t));
  }, [tabs, openTabs, closeTab]);

  /** 关标签：关的是当前简历时，切到相邻标签；全关则回列表页 */
  const handleTabClose = useCallback(
    (tabId: string) => {
      if (tabId === id) {
        const idx = openTabs.indexOf(tabId);
        const next = openTabs[idx + 1] ?? openTabs[idx - 1];
        closeTab(tabId);
        navigate(next ? `/editor/${next}` : '/resumes');
      } else {
        closeTab(tabId);
      }
    },
    [id, openTabs, closeTab, navigate],
  );

  /** 一键关闭全部标签：当前编辑器也随之关闭，回列表页 */
  const handleCloseAllTabs = useCallback(() => {
    closeAllTabs();
    navigate('/resumes');
  }, [closeAllTabs, navigate]);

  /* ----------------- 标签拖拽排序：跟手 + 邻居实时让位（FLIP） ----------------- */
  /* 仿 Chromium 标签条：换位需越过邻居中心，且距上次换位指针位移超过阈值
     （kHorizontalMoveThreshold=16px）才允许再次换位，防止边界振荡（乱晃）；
     每次渲染提交后重新解算拖拽标签位移，保证换位时视觉位置连续。 */
  const TAB_SWAP_THRESHOLD = 16;
  const tabEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabDrag = useRef<{ id: string; startX: number; grabDX: number; moved: boolean } | null>(null);
  const [tabDragId, setTabDragId] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[] | null>(null);
  const tabOrderRef = useRef<string[] | null>(null);
  const tabPrevRects = useRef<Map<string, DOMRect> | null>(null);
  const tabManual = useRef<Set<string>>(new Set());
  /** 上次换位时的指针 X（Chromium 的 last_move_drag_x_）与最近指针 X */
  const tabLastSwapX = useRef<number | null>(null);
  const tabLastPointerX = useRef<number | null>(null);
  /** 松手落位动画参数（视觉位置 → 新槽位） */
  const pendingTabDrop = useRef<{ id: string; visualLeft: number } | null>(null);

  /** 拖拽期间的展示顺序 */
  const displayedTabs = useMemo(() => {
    if (!tabOrder) return openTabs;
    const set = new Set(openTabs);
    return tabOrder.filter((t) => set.has(t));
  }, [openTabs, tabOrder]);

  /** 标签布局位置（扣除自身 translate：拖拽中的 transform 不得污染基线） */
  const tabLayoutRect = (el: HTMLElement): DOMRect => {
    const rect = el.getBoundingClientRect();
    const m = /translate3d\(\s*(-?[\d.]+)px/.exec(el.style.transform || '');
    const dx = m ? Number(m[1]) || 0 : 0;
    return dx ? new DOMRect(rect.left - dx, rect.top, rect.width, rect.height) : rect;
  };

  /* FLIP：顺序变化后其余标签从旧位置平滑滑到新位置（每次渲染后执行，与简历卡片同款）。
     拖拽标签在换位渲染提交后必须重新解算位移——元素被 React 挪到新槽位，
     布局位置变了，不补正的话视觉会突跳一下、下次 move 又被拽回（抖动的根源）。 */
  useLayoutEffect(() => {
    const d = tabDrag.current;
    if (d?.moved && tabLastPointerX.current !== null) {
      const dragEl = tabEls.current.get(d.id);
      if (dragEl) {
        const layoutLeft = tabLayoutRect(dragEl).left;
        dragEl.style.transition = 'none';
        dragEl.style.transform = `translate3d(${tabLastPointerX.current - d.grabDX - layoutLeft}px, 0, 0)`;
      }
    }
    const next = new Map<string, DOMRect>();
    tabEls.current.forEach((el, key) => next.set(key, tabLayoutRect(el)));
    const prev = tabPrevRects.current;
    tabPrevRects.current = next;
    if (!prev) return;
    next.forEach((rect, key) => {
      if (key === tabDragId || tabManual.current.has(key)) return;
      const p = prev.get(key);
      const el = tabEls.current.get(key);
      if (!p || !el) return;
      const dx = p.left - rect.left;
      if (Math.abs(dx) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms cubic-bezier(.22,1,.36,1)';
        el.style.transform = 'translate3d(0, 0, 0)';
        window.setTimeout(() => {
          el.style.transition = '';
          el.style.transform = '';
          tabPrevRects.current?.set(key, tabLayoutRect(el));
        }, 230);
      });
    });
  });

  /* 松手落位：拖拽标签从视觉位置平滑滑入新槽位 */
  useLayoutEffect(() => {
    const pd = pendingTabDrop.current;
    if (!pd) return;
    pendingTabDrop.current = null;
    const el = tabEls.current.get(pd.id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const m = /translate3d\(\s*(-?[\d.]+)px/.exec(el.style.transform || '');
    const layoutLeft = rect.left - (m ? Number(m[1]) || 0 : 0);
    const dx = pd.visualLeft - layoutLeft;
    if (Math.abs(dx) < 0.5) return;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${dx}px, 0, 0)`;
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 200ms cubic-bezier(.22,1,.36,1)';
      el.style.transform = 'translate3d(0, 0, 0)';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, 260);
    });
  });

  const startTabDrag = useCallback(
    (tabId: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return; // 关闭钮照常工作
      const el = tabEls.current.get(tabId);
      if (!el) return;
      const startX = e.clientX;
      el.style.transition = 'none'; // 按下即禁用过渡，拖动全程 1:1 跟手
      tabDrag.current = { id: tabId, startX, grabDX: e.clientX - tabLayoutRect(el).left, moved: false };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';

      const onMove = (ev: PointerEvent) => {
        const d = tabDrag.current;
        if (!d) return;
        tabLastPointerX.current = ev.clientX;
        if (!d.moved) {
          if (Math.abs(ev.clientX - startX) < 5) return; // 阈值内视为点击
          d.moved = true;
          tabManual.current.add(tabId);
          setTabDragId(tabId);
          const order = openTabs.slice();
          tabOrderRef.current = order;
          setTabOrder(order);
        }
        // 跟手（每次顺序变化后重新解算布局位置，保证全程 1:1）。
        // 必须禁用过渡：标签的 transition 类会把 transform 变化动画化，
        // 拖拽就变成「飘」着追指针（乱晃的元凶）。
        const cur = tabEls.current.get(tabId);
        if (cur) {
          if (cur.style.transition !== 'none') cur.style.transition = 'none';
          const layoutLeft = tabLayoutRect(cur).left;
          cur.style.transform = `translate3d(${ev.clientX - d.grabDX - layoutLeft}px, 0, 0)`;
        }
        // 换位判定：拖拽标签中心越过邻居中心；距上次换位位移超过阈值才允许再换
        // （Chromium kHorizontalMoveThreshold，防止在边界处来回振荡）
        const cur2 = tabEls.current.get(tabId);
        const order = tabOrderRef.current;
        if (!cur2 || !order) return;
        const r = cur2.getBoundingClientRect();
        const center = r.left + r.width / 2;
        if (
          tabLastSwapX.current !== null &&
          Math.abs(ev.clientX - tabLastSwapX.current) < TAB_SWAP_THRESHOLD
        ) {
          return;
        }
        const others = order.filter((t) => t !== tabId);
        let insertAt = 0;
        others.forEach((t) => {
          const oel = tabEls.current.get(t);
          if (!oel) return;
          const or = tabLayoutRect(oel);
          if (center > or.left + or.width / 2) insertAt += 1;
        });
        const nextOrder = [...others];
        nextOrder.splice(insertAt, 0, tabId);
        if (nextOrder.some((t, i) => order[i] !== t)) {
          tabLastSwapX.current = ev.clientX;
          tabOrderRef.current = nextOrder;
          setTabOrder(nextOrder);
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        const d = tabDrag.current;
        tabDrag.current = null;
        tabLastSwapX.current = null;
        tabLastPointerX.current = null;
        tabManual.current.delete(tabId);
        setTabDragId(null);
        const order = tabOrderRef.current;
        tabOrderRef.current = null;
        setTabOrder(null);
        if (!d?.moved || !order) return;
        // 记录视觉位置：顺序提交后由 layoutEffect 平滑滑入新槽位
        const el2 = tabEls.current.get(tabId);
        if (el2) pendingTabDrop.current = { id: tabId, visualLeft: el2.getBoundingClientRect().left };
        reorderTabs(order);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [openTabs, reorderTabs],
  );

  const exportRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<PreviewHandle | null>(null);
  const firstRun = useRef(true);

  /** 拖拽分隔条：上下拖动调整预览区高度（clamp 到合理范围，避免拖没或拖满全屏） */
  const startResize = useCallback(
    (down: React.MouseEvent) => {
      down.preventDefault();
      const startY = down.clientY;
      const startH = previewHeight ?? window.innerHeight * 0.46;
      const onMove = (move: MouseEvent) => {
        const max = Math.max(280, window.innerHeight - 360);
        setPreviewHeight(Math.round(Math.min(Math.max(220, startH + (move.clientY - startY)), max)));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [previewHeight],
  );

  /* ------------------------------ 自动保存状态机 ------------------------------ */
  useEffect(() => {
    if (!resume) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveStatus('saving');
    const timer = setTimeout(() => setSaveStatus('saved'), 600);
    return () => clearTimeout(timer);
  }, [resume, setSaveStatus]);

  /* -------------------------------- 提示条自动消失 ------------------------------- */
  useEffect(() => {
    if (!notice) return;
    // 导出指引这类长提示多停留几秒，避免用户来不及读
    const ttl = notice.length > 24 ? 8000 : 2600;
    const timer = setTimeout(() => setNotice(''), ttl);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ------------------------------ 当前模块有效性兜底 ----------------------------- */
  useEffect(() => {
    if (!resume) return;
    if (activeId === BASIC_MODULE_ID) return;
    if (!resume.sections.some((s) => s.id === activeId)) setActiveId(BASIC_MODULE_ID);
  }, [resume, activeId]);

  /* --------------------------------- 数据写回 --------------------------------- */
  const patchBasic = useCallback(
    (patch: Partial<BasicInfo>) => update(id, (r) => ({ ...r, basic: { ...r.basic, ...patch } })),
    [id, update],
  );

  const patchStyle = useCallback(
    (patch: Partial<ResumeStyle>) =>
      update(id, (r) => ({ ...r, style: { ...r.style, ...patch } })),
    [id, update],
  );

  const patchSpacing = useCallback(
    (patch: Partial<SpacingConfig>) =>
      update(id, (r) => ({
        ...r,
        style: { ...r.style, spacing: { ...r.style.spacing, ...patch } },
      })),
    [id, update],
  );

  const patchSection = useCallback(
    (sectionId: string, updater: (section: ResumeSection) => ResumeSection) =>
      update(id, (r) => ({
        ...r,
        sections: r.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
      })),
    [id, update],
  );

  /**
   * 添加模块：type 为 9 个预设类型时与模板自带模块完全同构
   * （同样的编辑表单与渲染样式）；'custom' 为自由命名的富文本模块。
   */
  const addSection = useCallback(
    (type: ModuleType, name?: string) => {
      const section = createSection(type, name?.trim() || undefined);
      update(id, (r) => ({ ...r, sections: [...r.sections, section] }));
      setActiveId(section.id);
    },
    [id, update],
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      update(id, (r) => ({ ...r, sections: r.sections.filter((s) => s.id !== sectionId) }));
      setActiveId((prev) => (prev === sectionId ? BASIC_MODULE_ID : prev));
    },
    [id, update],
  );

  const toggleVisible = useCallback(
    (sectionId: string) =>
      update(id, (r) => ({
        ...r,
        sections: r.sections.map((s) => (s.id === sectionId ? { ...s, visible: !s.visible } : s)),
      })),
    [id, update],
  );

  const renameSection = useCallback(
    (sectionId: string, title: string) =>
      update(id, (r) => ({
        ...r,
        sections: r.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
      })),
    [id, update],
  );

  const moveSection = useCallback(
    (sectionId: string, dir: -1 | 1) =>
      update(id, (r) => {
        const index = r.sections.findIndex((s) => s.id === sectionId);
        const target = index + dir;
        if (index < 0 || target < 0 || target >= r.sections.length) return r;
        const sections = [...r.sections];
        const tmp = sections[index];
        sections[index] = sections[target];
        sections[target] = tmp;
        return { ...r, sections };
      }),
    [id, update],
  );

  /** 拖动排序：把第 from 个模块移动到第 to 个位置 */
  const reorderSection = useCallback(
    (from: number, to: number) =>
      update(id, (r) => {
        const n = r.sections.length;
        if (from === to || from < 0 || to < 0 || from >= n || to >= n) return r;
        const sections = [...r.sections];
        const [moved] = sections.splice(from, 1);
        sections.splice(to, 0, moved);
        return { ...r, sections };
      }),
    [id, update],
  );

  /* --------------------------------- 智能一页 --------------------------------- */
  const handleSmartOnePage = useCallback(async () => {
    if (pageCount <= 1) {
      setNotice('已经是 1 页，无需压缩');
      return;
    }
    setCompressing(true);
    try {
      for (let round = 0; round < 120; round += 1) {
        const current = useResumeStore.getState().get(id);
        if (!current) break;
        const { spacing, fontScale } = current.style;
        const atMin =
          spacing.sectionGap <= 6 &&
          spacing.lineHeight <= 1.2 &&
          spacing.marginTop <= 16 &&
          spacing.marginBottom <= 16 &&
          fontScale <= 0.85;
        if (atMin) break;

        useResumeStore.getState().update(id, (r) => ({
          ...r,
          style: {
            ...r.style,
            fontScale: Math.max(0.85, Math.round((r.style.fontScale - 0.02) * 100) / 100),
            spacing: {
              ...r.style.spacing,
              sectionGap: Math.max(6, r.style.spacing.sectionGap - 2),
              lineHeight: Math.max(1.2, Math.round((r.style.spacing.lineHeight - 0.05) * 100) / 100),
              marginTop: Math.max(16, r.style.spacing.marginTop - 3),
              marginBottom: Math.max(16, r.style.spacing.marginBottom - 3),
            },
          },
        }));

        await waitForFrame();
        if ((previewRef.current?.measurePageCount() ?? 1) <= 1) break;
      }
    } finally {
      setCompressing(false);
    }
  }, [id, pageCount]);

  /* --------------------------------- PDF 导出 -------------------------------- */
  /** 公共前置：等待字体就绪并返回离屏 1:1 容器 */
  const prepareExport = useCallback(async () => {
    if (!user) {
      setNotice('请先登录后再导出简历');
      return null;
    }
    const root = exportRef.current;
    if (!root || !resume) return null;
    if (typeof document.fonts?.ready?.then === 'function') {
      try {
        await document.fonts.ready;
      } catch {
        /* 字体加载失败不阻断导出 */
      }
    }
    return root;
  }, [resume, user]);

  /**
   * 浏览器导出（推荐）：浏览器排版引擎渲染的**无损矢量 PDF** —— 放大不失真、文字可选中。
   *
   * 本地渲染服务（无头 Chrome printToPDF，小林简历同款架构）在运行时一键无框下载；
   * 服务没起则打开打印对话框「另存为 PDF」（边距选「无」、勾选「背景图形」）。
   * 两条路都用浏览器自己的排版引擎，所以与预览同一套字体、同一套布局。
   */
  const handleBrowserExport = useCallback(async () => {
    const root = await prepareExport();
    if (!root || !resume) return;
    setExporting(true);
    // 优先本地渲染服务（无头 Chrome 排版，一键下载不弹框）
    try {
      setNotice('正在生成 PDF（浏览器排版引擎）…');
      await exportViaService({ root, filename: resume.name || '我的简历', embed: { resume } });
      setNotice('PDF 已下载：浏览器排版引擎渲染，矢量无损、文字可选中、放大不模糊');
      setExporting(false);
      return;
    } catch {
      /* 服务未启动 → 走打印对话框 */
    }
    setNotice('正在打开打印窗口…');
    try {
      await printResume(root, resume?.name || '我的简历');
      setNotice('打印版 PDF 已保存（边距请选「无」、勾选「背景图形」）');
    } catch (err) {
      setNotice(`导出失败：${err instanceof Error ? err.message : '请稍后重试'}`);
    } finally {
      setExporting(false);
    }
  }, [prepareExport, resume]);

  /** 图片版导出（兼容模式）：矢量 PDF 栅格化成图片 PDF —— 同一浏览器排版引擎的几何源，布局一致 */
  const handleImageExport = useCallback(async () => {
    const root = await prepareExport();
    if (!root || !resume) return;
    setExporting(true);
    setNotice('正在生成图片版 PDF…');
    try {
      await exportResumePdf(root, resume?.name || '我的简历', { resume });
      setNotice('图片版 PDF 已下载：布局与浏览器导出一致，适合老阅读器 / 投递系统');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'PDF 导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [prepareExport, resume]);

  /* ---------------------------------- 顶栏重命名 -------------------------------- */
  const commitName = () => {
    const next = nameDraft.trim();
    if (resume && next && next !== resume.name) rename(id, next);
    setNameEditing(false);
  };

  if (!resume) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white p-6">
        <EmptyState
          icon={<FileWarning size={40} />}
          title="未找到该简历"
          description="简历可能已被删除，或链接已失效。"
          action={<Button onClick={() => navigate('/resumes')}>返回我的简历</Button>}
        />
      </div>
    );
  }

  const activeSection = resume.sections.find((s) => s.id === activeId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-100 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/resumes')}
            title="返回我的简历"
            aria-label="返回我的简历"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <ArrowLeft size={18} />
          </button>
          {nameEditing ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setNameEditing(false);
              }}
              className="h-8 w-64 rounded-lg border border-brand-400 bg-white px-2.5 text-[15px] font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400/25"
            />
          ) : (
            <button
              type="button"
              title="点击重命名"
              onClick={() => {
                setNameDraft(resume.name);
                setNameEditing(true);
              }}
              className="max-w-[380px] truncate rounded-lg px-2 py-1.5 text-[15px] font-semibold text-ink-900 transition hover:bg-ink-100"
            >
              {resume.name || '未命名简历'}
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-[13px] text-brand-600">
              <Loader2 size={14} className="animate-spin" />
              保存中...
            </span>
          )}
          {saveStatus === 'error' && (
            <button
              type="button"
              onClick={() => setSaveStatus('saved')}
              className="text-[13px] text-red-600 hover:underline"
            >
              保存失败，点击重试
            </button>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-[13px] text-ink-400">
              <Check size={14} />
              已自动保存
            </span>
          )}
          <Dropdown
            align="right"
            trigger={
              <Button size="sm" loading={exporting}>
                下载简历
                <ChevronDown size={14} />
              </Button>
            }
          >
            <MenuItem icon={<FileDown size={14} />} onClick={handleBrowserExport}>
              浏览器导出（推荐 · 无损矢量 · 放大不失真）
            </MenuItem>
            <MenuItem icon={<ImageDown size={14} />} onClick={handleImageExport}>
              图片版 PDF（兼容模式）
            </MenuItem>
            {/* 版本标识：用于排查「浏览器标签页还在跑旧代码」的问题（旧标签页 HMR 断连后不会自动更新） */}
            <div
              style={{
                padding: '5px 14px 3px',
                fontSize: 11,
                color: '#9ca3af',
                borderTop: '1px solid #f3f4f6',
                userSelect: 'text',
              }}
            >
              导出引擎 {EXPORT_BUILD_ID}
            </div>
          </Dropdown>
        </div>
      </header>

      {/* 多标签条：≥2 个标签时显示，点击切换 / 按住拖动排序 / X 或中键关闭 */}
      {displayedTabs.length > 1 && (
        <div className="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-ink-100 bg-ink-50 px-2.5">
          {displayedTabs.map((tabId) => {
            const r = resumes.find((x) => x.id === tabId);
            if (!r) return null;
            const active = tabId === id;
            const dragging = tabDragId === tabId;
            return (
              <div
                key={tabId}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                ref={(el) => {
                  if (el) tabEls.current.set(tabId, el);
                  else tabEls.current.delete(tabId);
                }}
                onPointerDown={(e) => startTabDrag(tabId, e)}
                onClick={() => !active && !tabDragId && navigate(`/editor/${tabId}`)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !active) {
                    e.preventDefault();
                    navigate(`/editor/${tabId}`);
                  }
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    handleTabClose(tabId);
                  }
                }}
                title={r.name || '未命名简历'}
                className={cn(
                  'group flex min-w-0 max-w-[190px] shrink-0 cursor-grab select-none items-center gap-1 rounded-t-lg px-2.5 text-[13px] transition',
                  active
                    ? 'bg-white font-medium text-ink-900 shadow-[inset_0_-2px_0_0_#2563eb]'
                    : 'text-ink-500 hover:bg-white/70 hover:text-ink-800',
                  dragging && 'cursor-grabbing opacity-80 shadow-[0_10px_22px_-8px_rgba(16,24,40,.45)]',
                )}
              >
                <span className="min-w-0 flex-1 truncate py-1.5">{r.name || '未命名简历'}</span>
                <button
                  type="button"
                  aria-label={`关闭「${r.name || '未命名简历'}」标签`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTabClose(tabId);
                  }}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded transition',
                    active
                      ? 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
                      : 'text-ink-300 opacity-0 group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-700',
                  )}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleCloseAllTabs}
            title="关闭全部标签页"
            className="ml-auto flex shrink-0 items-center gap-1 self-center rounded-md px-2 py-1 text-[12px] text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
          >
            <X size={12} />
            全部关闭
          </button>
        </div>
      )}

      {/* 主体 */}
      <div className="flex min-h-0 flex-1">
        <SettingPanel
          resume={resume}
          tab={tab}
          onTabChange={(next) => {
            // 单击图标开合：收起时展开该分组；展开时点同一图标收起；点其它图标切换
            if (collapsed) {
              setTab(next);
              setCollapsed(false);
            } else if (tab === next) {
              setCollapsed(true);
            } else {
              setTab(next);
            }
          }}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          onStyleChange={patchStyle}
          onSpacingChange={patchSpacing}
          onSwitchTemplate={(templateId) => switchStyle(id, templateId)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              'flex flex-col',
              panelCollapsed ? 'min-h-0 flex-1' : 'shrink-0',
            )}
            style={panelCollapsed ? undefined : { height: previewHeight ?? '46vh', minHeight: 240 }}
          >
            <PreviewPane
              ref={previewRef}
              resume={resume}
              pageCount={pageCount}
              onPageCountChange={setPageCount}
              compressing={compressing}
              onSmartOnePage={handleSmartOnePage}
              panelCollapsed={panelCollapsed}
              onTogglePanel={() => setPanelCollapsed((v) => !v)}
            />
          </div>

          {/* 拖拽分隔条：上下拖动调整预览区高度 */}
          {!panelCollapsed && (
            <div
              onMouseDown={startResize}
              title="上下拖动调整预览区大小"
              className="group relative h-2 shrink-0 cursor-row-resize"
            >
              <div className="absolute inset-x-10 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-100 transition group-hover:bg-brand-300" />
            </div>
          )}

          <div
            className={cn(
              'relative flex flex-col border-t border-ink-100',
              panelCollapsed ? 'shrink-0' : 'min-h-0 flex-1',
            )}
          >
            <ModuleNav
              resume={resume}
              activeId={activeId}
              onSelect={(next) => {
                setActiveId(next);
                if (panelCollapsed) setPanelCollapsed(false);
              }}
              onRename={renameSection}
              onToggleVisible={toggleVisible}
              onMove={moveSection}
              onAdd={addSection}
              onReorder={reorderSection}
              onDelete={(sectionId) => {
                const target = resume.sections.find((s) => s.id === sectionId);
                if (target) setDeleteTarget(target);
              }}
            />
            {!panelCollapsed && (
              <div
                className="min-h-0 flex-1 overflow-y-auto bg-[#f6f6f7] px-6 py-5"
                style={editorStyleVars}
              >
                <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
                  <GuideBanner text={MODULE_GUIDE} />
                  {activeId === BASIC_MODULE_ID || !activeSection ? (
                    <BasicInfoForm basic={resume.basic} onChange={patchBasic} />
                  ) : activeSection.kind === 'list' ? (
                    <ItemSectionForm
                      section={activeSection}
                      onChange={(updater) => patchSection(activeSection.id, updater)}
                      onDelete={() => setDeleteTarget(activeSection)}
                    />
                  ) : (
                    <RichSectionForm
                      section={activeSection}
                      onChange={(updater) => patchSection(activeSection.id, updater)}
                      onDelete={() => setDeleteTarget(activeSection)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 离屏 1:1 渲染容器：保证导出 PDF 清晰不失真 */}
      <div
        ref={exportRef}
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
        <ResumeRenderer resume={resume} withShadow={false} />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="删除模块"
        description={`确定要删除「${deleteTarget?.title ?? ''}」模块及其全部内容吗？删除后不可恢复。`}
        confirmText="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) removeSection(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      {notice && (
        <div
          className={cn(
            'pointer-events-none fixed left-1/2 top-20 z-[1100] -translate-x-1/2 rounded-lg bg-ink-900/90 px-4 py-2.5 text-[13px] text-white shadow-float',
          )}
        >
          {notice}
        </div>
      )}
    </div>
  );
}

/* touch: 1793176208 */

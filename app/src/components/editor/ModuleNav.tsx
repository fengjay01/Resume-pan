import { useEffect, forwardRef, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Switch, TextInput } from '@/components/common/Form';
import { SECTION_DEFS } from '@/lib/resume';
import { SECTION_ICONS } from '@/components/resume/parts';
import { cn } from '@/lib/cn';
import type { ModuleType, Resume, ResumeSection } from '@/types/resume';

export const BASIC_MODULE_ID = '__basic__';

/** 悬停浮层（‹ 显隐开关 › [删除]）的定位信息：锚点是模块标签顶边中点（视口坐标）。
 *
 * 只存 `sectionId` 而非 section 对象快照——快照会在 store 更新后变成「过期副本」，
 * 导致开关、删除按钮等读到的永远是旧状态（表现为「点了没反应 / 响应不及时」）。
 * 渲染时用 id 从最新的 resume 里取实时 section。 */
interface PillState {
  x: number;
  y: number;
  sectionId: string;
}

interface NavItemProps {
  title: string;
  dotState: 'filled' | 'empty';
  active: boolean;
  /** 未传表示该模块不支持显隐（基本信息） */
  visible?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  draggable?: boolean;
  onClick: () => void;
  onRename?: () => void;
  /** 悬停状态变化：true = 鼠标移入（显示浮层），false = 移出 */
  onHoverChange?: (hovering: boolean) => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}

export function ModuleNav({
  resume,
  activeId,
  onSelect,
  onRename,
  onToggleVisible,
  onMove,
  onAdd,
  onReorder,
  onDelete,
  panelCollapsed,
  onTogglePanel,
}: {
  resume: Resume;
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (sectionId: string, title: string) => void;
  onToggleVisible: (sectionId: string) => void;
  onMove: (sectionId: string, dir: -1 | 1) => void;
  onAdd: (type: ModuleType, name?: string) => void;
  /** 拖动排序：把第 from 个模块移到第 to 个位置 */
  onReorder?: (from: number, to: number) => void;
  /** 删除模块（9 个预设模块可在「添加模块」里重新加回，因此都可删） */
  onDelete?: (sectionId: string) => void;
  /** 下方编辑面板是否已收起 */
  panelCollapsed?: boolean;
  onTogglePanel?: () => void;
}) {
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  /** 「添加模块」里已有的预设类型（标记「已添加」，仍允许重复添加） */
  const existingTypes = new Set(resume.sections.map((s) => s.type));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pill, setPill] = useState<PillState | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  /** 各模块项的 DOM 引用：悬停时取视口坐标给浮层定位 */
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const showPill = (sectionId: string, el: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    const r = el.getBoundingClientRect();
    // 浮层完全盖住圆点（圆点行 10~17px），底边落在标签 padding 顶部
    setPill({ x: r.left + r.width / 2, y: r.top + 18, sectionId });
  };
  /** 延迟收起：给鼠标从模块项移入浮层留出间隙，避免闪烁 */
  const hidePill = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPill(null), 120);
  };

  /* 页面/容器滚动或窗口缩放时，固定定位的浮层会错位，直接收起 */
  useEffect(() => {
    if (!pill) return;
    const onMove = () => setPill(null);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [pill]);

  const openRename = (section: ResumeSection) => {
    setRenameTarget({ id: section.id, title: section.title });
    setRenameValue(section.title);
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (next) onRename(renameTarget.id, next);
    setRenameTarget(null);
  };

  const confirmAddCustom = () => {
    const next = addName.trim();
    if (next) onAdd('custom', next);
    setAddName('');
    setAddOpen(false);
  };

  /** 添加一个预设模块：与模板自带的模块完全同构（同样的结构 / 编辑表单 / 渲染样式） */
  const addPreset = (type: ModuleType) => {
    onAdd(type);
    setAddOpen(false);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  /** 浮层锚定的模块：按 id 从「最新的」resume 里取实时数据。
   *  这样开关/删除按钮/前后移的可用状态永远反映当前数据（而非悬停那一刻的快照），
   *  点击后界面在同一次渲染里立刻更新，不会出现「点了半天不动」。 */
  const pillSection = pill ? resume.sections.find((s) => s.id === pill.sectionId) : undefined;
  const pillIndex = pillSection ? resume.sections.indexOf(pillSection) : -1;

  return (
    <div className="relative border-b border-ink-100 bg-white">
      <div className="overflow-x-auto">
        <div className="mx-auto flex min-w-max items-start justify-center gap-1 px-4 pt-1.5 pb-2.5">
          <NavItem
            title="基本信息"
            dotState="filled"
            active={activeId === BASIC_MODULE_ID}
            onClick={() => onSelect(BASIC_MODULE_ID)}
          />

          {/* 圆点 = 模块启用状态：亮 = 在导航中启用（含刚添加的），灰 = 已隐藏。
              （是否「已填写内容」不由圆点表达——空模块只是还没渲染到简历上） */}
          {resume.sections.map((section, index) => (
            <NavItem
              key={section.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              title={section.title}
              dotState={section.visible ? 'filled' : 'empty'}
              active={activeId === section.id}
              visible={section.visible}
              dragging={dragIndex === index}
              dropTarget={dragIndex !== null && overIndex === index && dragIndex !== index}
              draggable={!!onReorder}
              onClick={() => onSelect(section.id)}
              onRename={() => openRename(section)}
              onHoverChange={(hovering) => {
                if (hovering && itemRefs.current[index]) {
                  showPill(section.id, itemRefs.current[index]!);
                } else if (!hovering) {
                  hidePill();
                }
              }}
              onDragStart={() => setDragIndex(index)}
              onDragOver={() => setOverIndex(index)}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) onReorder?.(dragIndex, index);
                endDrag();
              }}
              onDragEnd={endDrag}
            />
          ))}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            title="添加模块"
            className="flex shrink-0 items-center gap-1.5 px-2 pt-[17px] pb-2 text-ink-500 transition hover:text-brand-700"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-current">
              <Plus size={12} />
            </span>
            <span className="text-[13px]">添加模块</span>
          </button>
        </div>
      </div>

      {/* 悬停模块时浮出的「‹ 显隐开关 › [删除]」控件：fixed 定位悬浮在模块标签上方，
          不受横向滚动容器 overflow 裁剪（对照交互稿：控件出现在简历之上） */}
      {pill && pillSection && (
        <div
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={hidePill}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 flex items-center gap-0.5 rounded-full border border-ink-200 bg-white px-1 py-0.5 shadow-card"
          style={{ left: pill.x, top: pill.y, transform: 'translate(-50%, -100%)' }}
        >
          <button
            type="button"
            title="前移模块"
            aria-label="前移模块"
            disabled={pillIndex === 0}
            onClick={() => onMove(pillSection.id, -1)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={13} />
          </button>
          <Switch checked={pillSection.visible} onChange={() => onToggleVisible(pillSection.id)} />
          <button
            type="button"
            title="后移模块"
            aria-label="后移模块"
            disabled={pillIndex === resume.sections.length - 1}
            onClick={() => onMove(pillSection.id, 1)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <ChevronRight size={13} />
          </button>
          {onDelete && (
            <button
              type="button"
              title="删除模块"
              aria-label="删除模块"
              onClick={() => onDelete(pillSection.id)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="修改模块名称"
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmRename}>确认</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextInput
            value={renameValue}
            placeholder="请输入模块名称"
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
            }}
          />
          <p className="text-xs text-ink-500">修改后会同步更新当前模块的相关文案。</p>
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加模块"
        width={480}
      >
        <div className="flex flex-col gap-4">
          {/* 预设模块：与模板自带模块完全同构（编辑表单、渲染样式都一样） */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SECTION_DEFS) as Exclude<ModuleType, 'custom'>[]).map((type) => {
              const Icon = SECTION_ICONS[type];
              const added = existingTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addPreset(type)}
                  title={added ? '已添加，点击可再添加一个' : `添加「${SECTION_DEFS[type].title}」模块`}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 rounded-xl border bg-white px-2 py-3.5',
                    'text-[13px] text-ink-700 transition',
                    'hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
                    added ? 'border-brand-200' : 'border-ink-200',
                  )}
                >
                  {added && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  {Icon && <Icon size={18} strokeWidth={2} />}
                  {SECTION_DEFS[type].title}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-400">
            预设模块与模板自带的完全一致（含编辑表单与排版样式）；已添加的也可以再添加一个（如第二段项目经历）。
          </p>

          {/* 自定义模块：任意名称，富文本编辑 */}
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p className="mb-2 text-xs font-medium text-ink-500">自定义模块</p>
            <div className="flex items-center gap-2">
              <TextInput
                value={addName}
                placeholder="输入模块名称，如：实践经历、科研成果"
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddCustom();
                }}
              />
              <Button onClick={confirmAddCustom} disabled={!addName.trim()} className="shrink-0">
                添加
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-400">自由命名，内容用富文本编辑，可随时重命名或删除。</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const NavItem = forwardRef<HTMLDivElement, NavItemProps>(function NavItem(
  {
    title,
    dotState,
    active,
    visible,
    dragging,
    dropTarget,
    draggable,
    onClick,
    onRename,
    onHoverChange,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  },
  ref,
) {
  const hidden = visible === false;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', title);
        onDragStart?.();
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.();
      }}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDrop?.();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative flex shrink-0 flex-col items-center px-1 pt-2.5 transition',
        draggable && 'cursor-grab active:cursor-grabbing',
        hidden && 'opacity-80',
        dragging && 'opacity-40',
      )}
    >
      {/* 拖动插入位置指示 */}
      {dropTarget && (
        <span className="absolute top-2 bottom-3 -left-0.5 z-30 w-[2px] rounded-full bg-brand-600" />
      )}

      <span
        className={cn(
          'h-[7px] w-[7px] rounded-full',
          dotState === 'filled' ? 'bg-brand-600' : 'bg-ink-300',
          hidden && 'bg-ink-200',
        )}
      />

      <span
        className={cn(
          'relative flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] transition',
          active
            ? 'bg-brand-50 font-medium text-brand-700'
            : hidden
              ? 'text-ink-300'
              : 'text-ink-600 group-hover:text-ink-900',
        )}
      >
        {draggable && (
          <GripVertical size={11} className="shrink-0 text-ink-300 group-hover:text-ink-400" />
        )}
        {title}
        {active && onRename && (
          <button
            type="button"
            title="重命名模块"
            aria-label="重命名模块"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="rounded p-0.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-700"
          >
            <Pencil size={12} />
          </button>
        )}
        {active && (
          <span className="absolute -bottom-1 left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-brand-600" />
        )}
      </span>

      {/* 悬停浮层（‹ 显隐开关 › [删除]）由 ModuleNav 统一渲染（fixed 定位，浮在模块上方） */}
    </div>
  );
});

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Checkbox } from '@/components/common/Form';
import { cn } from '@/lib/cn';

/** 左侧标签 + 右侧控件的行内表单字段（对照编辑器截图） */
export function InlineField({
  label,
  labelWidth = 64,
  children,
  className,
  style,
}: {
  label: ReactNode;
  labelWidth?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)} style={style}>
      <span
        className="shrink-0 text-right text-[13px] text-ink-600"
        style={{ width: labelWidth, minWidth: labelWidth }}
      >
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </div>
  );
}

/**
 * 起止时间输入框的固定宽度。
 *
 * 必须固定宽度：`TextInput` 默认是 `w-full`，放在 flex 行里会被拉伸 / 挤压，
 * 导致「开始 - 结束 至今」整体超出容器 —— 此前会把「至今」复选框挤出卡片外 24px。
 */
export const TIME_INPUT_W = 128;

/** 时间区字段的固定总宽（= 标签 64 + 间隔 8 + 两个输入框 + 「-」+ 「至今」） */
export const TIME_FIELD_W = 416;

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 解析存储格式 "YYYY-MM" → { y, m }，无效返回 null */
function parseMonthValue(v: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{1,2})/.exec(v || '');
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { y, m: month } : null;
}

/**
 * 年月选择弹层：**月视图 ⇄ 十年视图**（对照交互稿）。
 * - 月视图：头部「2026年 ‹ ›」切换年份；点头部文字进入十年视图；
 * - 十年视图：头部「2020-2029 ‹ ›」按十年翻页；点头部文字返回月视图；
 * - 格子：月视图为 12 个月，十年视图为「首年-1 ～ 末年+1」共 12 个年份
 *   （ decade 外的年份置灰）；点击格子即选中。
 */
function MonthPickerPanel({
  value,
  pos,
  onPick,
}: {
  value: string;
  /** 面板左上角视口坐标（由 MonthField 量出；fixed 定位必须显式给，不能靠静态流位置） */
  pos: { left: number; top: number };
  onPick: (ym: string) => void;
}) {
  const selected = parseMonthValue(value);
  const [year, setYear] = useState(selected?.y ?? new Date().getFullYear());
  const [decade, setDecade] = useState<number | null>(null);
  const start = Math.floor(year / 10) * 10;
  const iconBtn =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-700';

  const header = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        aria-label="上一年"
        className={iconBtn}
        onClick={() => setYear((y) => y - (decade === null ? 1 : 10))}
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={() => setDecade((d) => (d === null ? start : null))}
        className={cn(
          'rounded-md px-2 py-0.5 text-[14px] font-medium transition hover:bg-ink-100',
          decade === null ? 'text-ink-800' : 'text-brand-600',
        )}
      >
        {decade === null ? `${year}年` : `${start} - ${start + 9}`}
      </button>
      <button
        type="button"
        aria-label="下一年"
        className={iconBtn}
        onClick={() => setYear((y) => y + (decade === null ? 1 : 10))}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );

  const cell = (active: boolean, dimmed: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-lg text-[13px] transition',
        active
          ? 'bg-brand-600 font-medium text-white'
          : dimmed
            ? 'text-ink-300 hover:bg-ink-100'
            : 'text-ink-700 hover:bg-ink-100',
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      data-month-panel=""
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[1200] w-[248px] rounded-xl border border-ink-100 bg-white p-3 shadow-float"
    >
      {header}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {decade === null
          ? MONTH_LABELS.map((label, i) =>
              cell(
                selected?.y === year && selected.m === i + 1,
                false,
                label,
                () => onPick(`${year}-${String(i + 1).padStart(2, '0')}`),
              ),
            )
          : Array.from({ length: 12 }, (_, i) => start - 1 + i).map((y) =>
              cell(
                selected?.y === y,
                y < start || y > start + 9,
                String(y),
                () => {
                  setYear(y);
                  setDecade(null);
                },
              ),
            )}
      </div>
    </div>
  );
}

/**
 * 年月选择框：展示「YYYY/MM」+ 清除 × + 日历图标，点日历图标弹出
 * 年月选择面板（月视图 ⇄ 十年视图，见 MonthPickerPanel）。
 * 替代原生 `<input type="month">` —— 各浏览器原生面板样式不可控且交互不一致。
 */
export function MonthField({
  value,
  placeholder,
  onChange,
  fullWidth,
}: {
  value: string;
  placeholder: string;
  onChange: (ym: string) => void;
  /** 占满父容器宽度（默认固定 TIME_INPUT_W） */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btnRef = useRef<HTMLDivElement>(null);
  const selected = parseMonthValue(value);
  const display = selected ? `${selected.y}/${String(selected.m).padStart(2, '0')}` : '';

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const PANEL_H = 224; // 与面板实际高度一致（头部 28 + 网格 4 行 36 + 间距 + p-3）
    // 下方放不下就翻到触发器上方（编辑器面板矮，常见）
    const below = r.bottom + 6;
    const top = below + PANEL_H > window.innerHeight ? Math.max(8, r.top - PANEL_H - 6) : below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 268)),
      top,
    });
    setOpen(true);
  };
  const close = () => setOpen(false);
  const toggle = () => (open ? close() : show());

  /* 打开期间：点外部 / 滚动 / 缩放 / Escape 关闭（fixed 定位，滚动会错位） */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (btnRef.current?.contains(t)) return;
      if (t && 'closest' in t && t.closest('[data-month-panel]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <div
        ref={btnRef}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        title={open ? undefined : '点击选择年月'}
        className={cn(
          'flex h-10 w-full cursor-pointer select-none items-center gap-1 rounded-lg border px-2 text-[13px] transition',
          open
            ? 'border-brand-400 ring-2 ring-brand-100'
            : 'border-ink-200 hover:border-ink-300',
          display ? 'text-ink-800' : 'text-ink-400',
        )}
        style={fullWidth ? undefined : { width: TIME_INPUT_W }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{display || placeholder}</span>
        {selected && (
          <button
            type="button"
            title="清除"
            aria-label="清除"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
          >
            <X size={12} />
          </button>
        )}
        <CalendarDays size={14} className="shrink-0 text-ink-400" />
      </div>
      {open && (
        <MonthPickerPanel
          value={value}
          pos={pos}
          onPick={(ym) => {
            onChange(ym);
            close();
          }}
        />
      )}
    </>
  );
}

/** 起止时间（month）× 至今 */
export function TimeRangeField({
  startDate,
  endDate,
  current,
  onChange,
  className,
}: {
  startDate: string;
  endDate: string;
  current: boolean;
  onChange: (patch: { startDate?: string; endDate?: string; current?: boolean }) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <MonthField
        value={startDate}
        placeholder="开始"
        onChange={(v) => onChange({ startDate: v })}
      />
      <span className="shrink-0 text-ink-400">-</span>
      {/* 勾选「至今」后隐藏结束输入框（对照参考图：由复选框占据该位置） */}
      {!current && (
        <MonthField
          value={endDate}
          placeholder="结束"
          onChange={(v) => onChange({ endDate: v })}
        />
      )}
      <Checkbox
        checked={current}
        onChange={(v) => onChange({ current: v, ...(v ? { endDate: '' } : {}) })}
        label="至今"
        className="shrink-0 whitespace-nowrap"
      />
    </div>
  );
}

/**
 * 条目式模块的字段行：统一「横向间距 + 换行 + 右侧留白」。
 * 右侧留白保证行的最后一个字段（通常是时间区的「至今」）不会贴到卡片边缘。
 */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start gap-x-5 gap-y-3 pr-6', className)}>
      {children}
    </div>
  );
}

/** 带蓝色竖条的模块标题 */
export function ModuleHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn('flex items-center gap-2 text-[15px] font-semibold text-ink-900', className)}>
      <span className="h-4 w-[3px] rounded-full bg-brand-600" />
      {children}
    </h3>
  );
}

/** 模块填写引导条 */
export function GuideBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-800">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/** 设置面板中的一个分组 */
export function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-[13px] font-medium text-ink-600">{title}</p>
      {children}
    </div>
  );
}

/** 设置面板底部「当前模板 + 风格说明」 */
export function CurrentTemplateInfo({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
      <p className="text-[12px] text-ink-400">当前模板</p>
      <p className="mt-1 text-[14px] font-semibold text-ink-900">{name}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{desc}</p>
    </div>
  );
}

/** 面板内的横向选项按钮（选中主题色描边） */
export function ChoiceButton({
  active,
  children,
  onClick,
  className,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg border px-3 py-2 text-[13px] transition',
        active
          ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900',
        className,
      )}
    >
      {children}
    </button>
  );
}


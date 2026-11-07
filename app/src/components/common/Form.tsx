import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Field({
  label,
  children,
  hint,
  className,
  labelClassName,
}: {
  label?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className={cn('text-[13px] font-medium text-ink-700', labelClassName)}>{label}</label>
      )}
      {children}
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 transition',
        'placeholder:text-ink-400 hover:border-ink-300',
        'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/25',
        'disabled:bg-ink-50 disabled:text-ink-400',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none rounded-lg border border-ink-200 bg-white bg-[length:16px] bg-[right_10px_center] bg-no-repeat px-3 pr-8 text-sm text-ink-900 transition',
        'hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/25',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  /** 输入框的草稿值：聚焦后以文本编辑，失焦 / 回车提交（非法输入回退当前值） */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (raw: string) => {
    const n = Number(raw.trim());
    if (raw.trim() !== '' && Number.isFinite(n)) {
      const next = clamp(n);
      if (next !== value) onChange(next);
    }
    setDraft(null);
  };
  /** 上下方向键 = 按 step 微调 */
  const nudge = (dir: 1 | -1) => {
    const next = clamp(Math.round((value + dir * step) * 100) / 100);
    if (next !== value) onChange(next);
    setDraft(null);
  };

  /** 悬停在滑杆上滚动滚轮 = 按 step 微调。
   *  必须用原生监听并显式 `passive: false`：React 17+ 的 onWheel 委托在根节点上是
   *  passive 的，preventDefault 会失效，页面会跟着滚。
   *  另外快速连滚时 React 还没来得及重渲染，直接用闭包里的 value 会一直是旧值
   *  （60 个事件只走一步）——用 ref 立即记账，保证每格都生效。 */
  const trackRef = useRef<HTMLDivElement>(null);
  const wheelValue = useRef(value);
  wheelValue.current = value;
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      e.preventDefault();
      const next = clamp(Math.round((wheelValue.current + (e.deltaY < 0 ? 1 : -1) * step) * 100) / 100);
      if (next === wheelValue.current) return;
      wheelValue.current = next;
      onChange(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div ref={trackRef} className="relative flex-1" title="悬停后滚动滚轮可微调">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-ink-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-600"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:bg-brand-600 [&::-webkit-slider-thumb]:shadow
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-600"
        />
      </div>
      {/* 数值框：除了拖滑杆，也可以直接输入数字精确调节 */}
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? (format ? format(value) : String(value))}
        title="可直接输入数字"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setDraft(String(value))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(-1);
          }
        }}
        className="w-14 shrink-0 rounded-md border border-ink-200 bg-white px-1.5 py-1 text-right text-[13px]
          font-medium tabular-nums text-ink-700 outline-none transition
          hover:border-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400/40"
      />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-ink-300',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
          checked ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

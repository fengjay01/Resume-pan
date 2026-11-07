import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm disabled:bg-brand-300',
  secondary: 'bg-ink-100 text-ink-800 hover:bg-ink-200 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  outline:
    'border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  /* 深色底上的白底按钮（如首页底部 CTA）。必须走变体而不是 className 覆盖：
     cn() 是纯拼接（无 tailwind-merge），primary 的 text-white 与 className 里的
     text-brand-700 同时存在时，由 Tailwind 生成的 CSS 顺序决定胜负
     （同类工具类按名称排序，text-white 恰好在后），className 必输 → 白底白字 */
  inverse:
    'bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 shadow-sm disabled:bg-ink-100 disabled:text-ink-400',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        // whitespace-nowrap：按钮空间不足时文字绝不允许折行（否则会出现「编/辑」上下两行）
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

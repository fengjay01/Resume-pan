import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'left';
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        action ? 'md:flex-row md:items-end md:justify-between md:text-left' : undefined,
        className,
      )}
    >
      <div className={cn('flex flex-col gap-3', align === 'center' && !action && 'items-center')}>
        {eyebrow && (
          <span className="text-[13px] font-semibold uppercase tracking-wide text-brand-600">
            {eyebrow}
          </span>
        )}
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-ink-900 md:text-[32px]">
          {title}
        </h2>
        {subtitle && (
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

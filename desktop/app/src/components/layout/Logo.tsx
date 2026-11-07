import { cn } from '@/lib/cn';

export function Logo({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#2563eb" />
        <path
          d="M20 16h20l8 8v24a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z"
          fill="#fff"
          opacity=".95"
        />
        <path
          d="M24 30h16M24 38h16M24 46h10"
          stroke="#2563eb"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[19px] font-semibold tracking-tight text-ink-900">Resume-Pan</span>
    </span>
  );
}

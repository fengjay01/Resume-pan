import { Star } from 'lucide-react';

export function TestimonialCard({
  name,
  role,
  content,
  rating = 5,
}: {
  name: string;
  role: string;
  content: string;
  rating?: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex gap-0.5 text-amber-400">
        {Array.from({ length: rating }).map((_, i) => (
          <Star key={i} className="h-4 w-4" fill="currentColor" strokeWidth={0} />
        ))}
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-600">{content}</p>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
          {name.slice(0, 1)}
        </span>
        <div>
          <div className="text-sm font-semibold text-ink-900">{name}</div>
          <div className="text-xs text-ink-400">{role}</div>
        </div>
      </div>
    </div>
  );
}

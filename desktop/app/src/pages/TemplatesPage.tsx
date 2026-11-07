import { useEffect, useMemo, useState } from 'react';
import { FileSearch, Search, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/Misc';
import { TEMPLATES } from '@/data/templates';
import type { TemplateMeta } from '@/types/resume';
import { TemplateCard } from '@/components/site/TemplateCard';
import { TemplatePreviewModal } from '@/components/site/TemplatePreviewModal';
import { useUseTemplate } from '@/components/site/useUseTemplate';

export default function TemplatesPage() {
  const useTemplate = useUseTemplate();

  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<TemplateMeta | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return TEMPLATES;
    return TEMPLATES.filter((tpl) =>
      `${tpl.name} ${tpl.styleName} ${tpl.description} ${tpl.tags.join(' ')}`
        .toLowerCase()
        .includes(kw),
    );
  }, [keyword]);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      {/* 页头 */}
      <header className="flex flex-col gap-3">
        <h1 className="text-[32px] font-bold tracking-tight text-ink-900">简历模板</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-500">
          共 {TEMPLATES.length} 款模板，对应 6 种章节标题版式，颜色可在编辑器「样式 → 主题色」中自由更换。
        </p>
      </header>

      {/* 搜索 */}
      <div className="sticky top-16 z-30 -mx-6 mt-6 border-b border-ink-100 bg-[#f6f7f9]/95 px-6 py-4 backdrop-blur">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模板名称、版式或标签"
            className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-9 text-sm text-ink-900 transition placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/25"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              aria-label="清除搜索"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 模板列表：自然横向顺序排列 */}
      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<FileSearch className="h-10 w-10" />}
            title="没有找到匹配的模板"
            description="试试更换关键词，或清除搜索后重新查找。"
            action={
              keyword.trim() ? (
                <Button variant="outline" onClick={() => setKeyword('')}>
                  清除搜索
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onPreview={setPreview}
              onUse={(t) => useTemplate(t.id, '/templates')}
            />
          ))}
        </div>
      )}

      <TemplatePreviewModal
        template={preview}
        open={!!preview}
        onClose={() => setPreview(null)}
        onUse={(t) => useTemplate(t.id, '/templates')}
      />
    </div>
  );
}

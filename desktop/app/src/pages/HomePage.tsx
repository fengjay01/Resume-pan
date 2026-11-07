import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Cloud,
  Eye,
  FileDown,
  LayoutGrid,
  LayoutTemplate,
  PenLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { SAMPLE_RESUME } from '@/data/sampleResume';
import { TEMPLATES } from '@/data/templates';
import { useAuthStore } from '@/store/auth';
import type { TemplateMeta } from '@/types/resume';
import { FeatureCard } from '@/components/site/FeatureCard';
import { ResponsiveThumbnail } from '@/components/site/ResponsiveThumbnail';
import { SectionHeading } from '@/components/site/SectionHeading';
import { TemplateCard } from '@/components/site/TemplateCard';
import { TemplatePreviewModal } from '@/components/site/TemplatePreviewModal';
import { TestimonialCard } from '@/components/site/TestimonialCard';
import { useUseTemplate } from '@/components/site/useUseTemplate';

const FEATURES = [
  {
    icon: PenLine,
    title: '在线编辑器',
    desc: '简洁易用的在线编辑器，支持富文本编辑，让你轻松填写简历内容，快速完成简历制作。',
  },
  {
    icon: LayoutGrid,
    title: '精美模板库',
    desc: '6 款按种类精选的专业模板（3 种版式 × 校招/社招），一键套用即可生成精美简历。',
  },
  {
    icon: Eye,
    title: '实时预览',
    desc: '所见即所得的编辑体验，实时预览简历效果，让你的每一次修改都完美呈现。',
  },
  {
    icon: FileDown,
    title: 'PDF 导出',
    desc: '一键导出高质量 PDF 文件，完美还原设计效果，随时投递给心仪的公司。',
  },
  {
    icon: ShieldCheck,
    title: '隐私安全',
    desc: '你的个人信息完全加密存储，我们承诺永远不会泄露你的隐私数据。',
  },
  {
    icon: Cloud,
    title: '云端存储',
    desc: '简历自动保存到云端，随时随地登录编辑，再也不用担心数据丢失。',
  },
];

const TESTIMONIALS = [
  {
    name: '张同学',
    role: '前端开发工程师 · 腾讯',
    content: '用这个工具制作的简历帮我拿到了腾讯的 offer，模板真的很专业！排版整洁大方，HR 一眼就看到了我的核心优势。',
  },
  {
    name: '李同学',
    role: 'Java 开发实习生 · 字节跳动',
    content: '操作简单，模板美观，导出的 PDF 格式完美。作为应届生，这个工具让我的简历看起来非常专业，顺利拿到了字节跳动的实习 offer。',
  },
  {
    name: '王同学',
    role: '后端开发工程师 · 阿里巴巴',
    content: '终于找到一款真正好用的简历工具！模板多样，质量高，节省了大量排版时间。用它制作的简历投递后，面试邀约率提升了 50% 以上。',
  },
];

const STATS = [
  { icon: LayoutTemplate, value: '6 款', label: '精选模板' },
  { icon: FileDown, value: 'PDF', label: '一键导出' },
  { icon: BadgeCheck, value: '免费', label: '完全免费' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const useTemplate = useUseTemplate();

  const [preview, setPreview] = useState<TemplateMeta | null>(null);

  const startHref = user ? '/resumes' : '/templates';

  return (
    <div>
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background:
              'radial-gradient(60% 55% at 78% 30%, rgba(37,99,235,0.14), transparent 70%), radial-gradient(45% 45% at 12% 8%, rgba(37,99,235,0.08), transparent 70%)',
          }}
        />
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-6 py-16 lg:grid-cols-[46fr_54fr] lg:py-24">
          <div className="flex flex-col items-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-[13px] font-medium text-brand-700">
              <Sparkles className="h-3.5 w-3.5" />
              免费制作 · 登录即用
            </span>

            <h1 className="mt-6 text-[38px] font-bold leading-[1.15] tracking-tight text-ink-900 md:text-[52px]">
              Resume-Pan，
              <br />
              一键生成
              <span className="relative ml-1 text-brand-600">
                好简历
                <span
                  className="absolute -bottom-1 left-0 h-2 w-full rounded-full bg-brand-600/15"
                  aria-hidden
                />
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-500 md:text-base">
              Resume-Pan 是一款面向技术从业者的在线简历制作工具，支持专业模板、实时编辑与一键导出 PDF，
              帮你更高效完成求职简历。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate(startHref)}>
                免费开始制作
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/templates')}>
                浏览简历模板
              </Button>
            </div>

            <div className="mt-12 grid w-full max-w-lg grid-cols-3 gap-6">
              {STATS.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-xl font-bold text-ink-900">{s.value}</div>
                    <div className="text-xs text-ink-500">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div
              className="pointer-events-none absolute -inset-12 -z-10"
              aria-hidden
              style={{
                background:
                  'radial-gradient(circle at 62% 42%, rgba(37,99,235,0.22), transparent 62%)',
              }}
            />
            <div className="w-full max-w-[470px] rotate-[1.5deg] rounded-xl bg-white p-1.5 shadow-float ring-1 ring-ink-900/5 transition duration-300 hover:rotate-0">
              <ResponsiveThumbnail resume={SAMPLE_RESUME} className="rounded-lg" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 精选模板 ---------------- */}
      <section className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
        <SectionHeading
          eyebrow="简历模板"
          title="精选专业简历模板"
          subtitle="选择最适合你的模板，快速创建脱颖而出的专业简历"
        />
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 6).map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onPreview={setPreview}
              onUse={(t) => useTemplate(t.id, '/')}
            />
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Button size="lg" variant="outline" onClick={() => navigate('/templates')}>
            查看全部模板
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ---------------- 功能特性 ---------------- */}
      <section className="border-y border-ink-100 bg-white">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="功能特性"
            title="让简历制作变得简单高效"
            subtitle="从专业模板到便捷导出，我们为你提供一站式简历制作解决方案"
          />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.desc} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 用户评价 ---------------- */}
      <section className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
        <SectionHeading
          eyebrow="用户评价"
          title="听听他们怎么说"
          subtitle="从 0 到 1 打造你的专业简历，让你的优势被一眼看见"
        />
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <TestimonialCard key={t.name} name={t.name} role={t.role} content={t.content} />
          ))}
        </div>
      </section>

      {/* ---------------- 底部 CTA ---------------- */}
      <section className="mx-auto max-w-[1240px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-14 text-center shadow-float md:px-16 md:py-16">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                'radial-gradient(50% 60% at 20% 10%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(40% 50% at 90% 90%, rgba(255,255,255,0.12), transparent 60%)',
            }}
          />
          <div className="relative flex flex-col items-center">
            <h2 className="text-[28px] font-bold tracking-tight text-white md:text-[34px]">
              开始制作你的简历
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
              立即开始，用专业模板打造完美简历，开启理想职业生涯
            </p>
            <Button
              size="lg"
              variant="inverse"
              className="mt-8"
              onClick={() => navigate(startHref)}
            >
              免费开始制作
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="mt-3 text-xs text-white/70">完全免费 · 立即体验</span>
          </div>
        </div>
      </section>

      <TemplatePreviewModal
        template={preview}
        open={!!preview}
        onClose={() => setPreview(null)}
        onUse={(t) => useTemplate(t.id, '/')}
      />
    </div>
  );
}

import { useState } from 'react';
import { ArrowRight, Clock, BookOpen } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Tag } from '@/components/common/Misc';
import { cn } from '@/lib/cn';

interface Article {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  readTime: string;
  cover: string;
  paragraphs: string[];
}

const ARTICLES: Article[] = [
  {
    id: 'a1',
    title: '简历排版：让 HR 一眼看到重点',
    excerpt: 'HR 平均只用 7 秒扫过一份简历，清晰的层级与留白，比堆砌内容更能提升通过率。',
    tags: ['排版', '校招'],
    readTime: '6 分钟',
    cover: 'from-brand-500 to-brand-700',
    paragraphs: [
      '简历不是信息仓库，而是一张「注意力地图」。HR 初筛时不会逐字阅读，而是快速扫描关键词与结构层级，因此把最重要的信息放在最显眼的位置，是排版的第一原则。',
      '建议采用清晰的模块划分：教育背景、专业技能、实习/项目经历、校园与获奖。每个模块用统一的小标题样式，段落之间保持充足留白，避免所有文字挤在一起。',
      '正文控制在 10.5pt 左右，行距 1.4～1.6；重点内容用加粗而非大段标红。一页篇幅优先，内容过多时优先删减与岗位关联度低的经历。',
      '最后，导出 PDF 时务必检查：字体是否完整嵌入、页面是否被截断、日期格式是否统一。这些细节往往决定了简历的「专业感」。',
    ],
  },
  {
    id: 'a2',
    title: '校招简历怎么写：从 0 到 1 的完整清单',
    excerpt: '没有全职工作经验，也能通过教育背景、实习与项目，把技术潜力讲清楚。',
    tags: ['校招', '实习'],
    readTime: '8 分钟',
    cover: 'from-emerald-500 to-teal-600',
    paragraphs: [
      '校招简历的核心不是「经历多」，而是「可培养」。招聘方希望看到扎实的基础、清晰的思考方式，以及能落地的动手能力。',
      '教育背景建议前置，写清学校、专业、学历与在校时间；有 GPA 排名、核心课程或奖学金可以补充，但不必堆砌与岗位无关的内容。',
      '实习与项目是校招简历的重头戏。每条经历都建议采用「背景—动作—结果」的结构，用数字量化你的贡献，比如「将接口平均响应时间从 320ms 优化到 90ms」。',
      '最后，别忘了仔细检查错别字与时间线一致性。一份格式干净、逻辑清晰的简历，本身就是你工程素养的体现。',
    ],
  },
  {
    id: 'a3',
    title: '技术简历中的项目经历如何量化',
    excerpt: '把「做了什么」升级为「带来了什么改变」，让技术价值被一眼看见。',
    tags: ['项目', '社招'],
    readTime: '7 分钟',
    cover: 'from-violet-500 to-purple-700',
    paragraphs: [
      '很多技术简历的项目描述停留在职责罗列，比如「负责后端接口开发」。这类描述无法体现你的水平，因为它没有结果、没有对比、没有规模。',
      '量化的三个维度：性能（QPS、延迟、吞吐）、规模（用户量、数据量、并发）、效率（人力节省、耗时下降、成本降低）。选与你项目最相关的一到两个维度即可。',
      '推荐句式：「针对 XX 问题，采用 XX 方案，使 XX 指标从 A 提升到 B」。让面试官在扫读时就能捕捉到关键数字。',
      '数字要真实可解释。面试时你一定会被追问细节，与其夸大，不如把范围与前提交代清楚，反而更显专业。',
    ],
  },
  {
    id: 'a4',
    title: '社招跳槽简历的 3 个关键改动',
    excerpt: '从「经历清单」转向「价值证明」，让你的涨薪诉求有据可依。',
    tags: ['社招', '进阶'],
    readTime: '6 分钟',
    cover: 'from-amber-500 to-orange-600',
    paragraphs: [
      '社招简历与校招最大的区别在于：招聘方关心的是你能解决多复杂的问题、带来多大的业务价值，而不是你学过什么。',
      '第一，调序：把「专业技能」与「工作经历」前置，教育背景后置。第二，聚焦：删掉与目标岗位无关的早期经历，突出最近 3～5 年的核心项目。',
      '第三，量化：把职责描述改写成成果描述，并尽量与业务指标挂钩，比如「支撑大促峰值 5 万 QPS，实现全年零故障」。',
      '如果经历过架构升级、性能治理或团队技术建设，这些「横向影响力」的内容往往比单纯的功能开发更有说服力。',
    ],
  },
  {
    id: 'a5',
    title: '大模型 / 算法岗简历的关键词与技能栈',
    excerpt: '精准命中 JD 关键词，让你的简历更容易通过机器初筛与人工复核。',
    tags: ['大模型算法', 'AI应用开发'],
    readTime: '7 分钟',
    cover: 'from-sky-500 to-cyan-600',
    paragraphs: [
      '算法岗简历首先要在关键词上「对齐」。很多公司会先用系统做初筛，简历中缺少 JD 里的核心技术词，往往会直接落选。',
      '技能栈建议分层书写：编程与工程基础（Python/C++、PyTorch、分布式训练）、算法能力（模型微调、RAG、多模态、强化学习）、工程落地（推理加速、部署与监控）。',
      '项目描述中尽量体现完整链路：数据构建、模型训练、评测、上线与迭代。只写「调了模型」很难体现工程深度。',
      '如果有论文、专利或竞赛成果，放在科研/获奖模块，并注明你的具体贡献，而不是只列标题。',
    ],
  },
  {
    id: 'a6',
    title: '简历投递后没回音？先从这 5 点自检',
    excerpt: '投递石沉大海，往往不是能力问题，而是简历与岗位的匹配信号不够强。',
    tags: ['求职', '自检'],
    readTime: '5 分钟',
    cover: 'from-rose-500 to-pink-600',
    paragraphs: [
      '第一，岗位匹配度：你的简历是否覆盖了 JD 中 60% 以上的核心要求？关键词是否一致？',
      '第二，信息层级：核心优势是否出现在前 1/3 的版面内？HR 可能根本没有读到后面的内容。',
      '第三，量化程度：你的经历是「做了什么」还是「带来了什么结果」？后者才有说服力。',
      '第四，格式与细节：是否一页、是否统一字体与日期格式、是否导出了正确的 PDF、是否有错别字。',
      '第五，投递策略：同一份简历投遍所有岗位，命中率必然低。针对不同岗位准备 2～3 个版本，往往能显著提升回复率。',
    ],
  },
];

export default function JobGuidePage() {
  const [active, setActive] = useState<Article | null>(null);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-[32px] font-bold tracking-tight text-ink-900">求职指北</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-500">
          从简历撰写到投递策略，这里有技术求职路上最实用的经验与方法，帮你的简历更容易被看见。
        </p>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {ARTICLES.map((a) => (
          <article
            key={a.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
          >
            <div
              className={cn(
                'flex h-32 items-center justify-center bg-gradient-to-br text-white',
                a.cover,
              )}
            >
              <BookOpen className="h-8 w-8 opacity-80" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <Tag key={t} className="bg-brand-50 text-[11px] text-brand-700">
                    {t}
                  </Tag>
                ))}
              </div>
              <h2 className="text-base font-semibold leading-snug text-ink-900">{a.title}</h2>
              <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-500">{a.excerpt}</p>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                  <Clock className="h-3.5 w-3.5" />
                  {a.readTime}
                </span>
                <button
                  type="button"
                  onClick={() => setActive(a)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:text-brand-700"
                >
                  阅读全文
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        width={720}
        title={active?.title}
        bodyClassName="max-h-[70vh] overflow-y-auto"
      >
        {active && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {active.tags.map((t) => (
                <Tag key={t} className="bg-brand-50 text-[11px] text-brand-700">
                  {t}
                </Tag>
              ))}
              <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                <Clock className="h-3.5 w-3.5" />
                {active.readTime}
              </span>
            </div>
            {active.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-600">
                {p}
              </p>
            ))}
            <p className="mt-2 rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-400">
              本文为示例内容，仅用于演示「求职指北」阅读体验。
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

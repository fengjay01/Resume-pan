import { createDefaultStyle, createSectionsForTemplate, createEmptyBasicInfo } from '@/lib/resume';
import { DEFAULT_SPACING } from '@/data/design';
import type { Resume, ResumeItem, ResumeSection } from '@/types/resume';

function item(data: Partial<ResumeItem>): ResumeItem {
  return {
    id: `sample-it-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    role: '',
    label: '',
    labelValue: '',
    startDate: '',
    endDate: '',
    current: false,
    content: '',
    ...data,
  };
}

function section(
  type: ResumeSection['type'],
  title: string,
  kind: 'list' | 'rich',
  data: Partial<ResumeSection>,
): ResumeSection {
  return {
    id: `sample-sec-${type}`,
    type,
    title,
    visible: true,
    kind,
    items: [],
    content: '',
    ...data,
  };
}

/**
 * 示例简历的全部内容都是 XX / XXX 占位文案：
 * 首页预览会原样展示这份简历，不能出现任何真实的个人信息。
 * 文案风格与「使用模板创建简历」时的引导内容保持一致。
 */
const SKILLS_HTML = `<ul>
<li>熟悉 <strong>XXX、XXX</strong> 与 XXX 开发，掌握 XXX 与 XXX，熟练使用 XXX / XXX / XXX 工具链。</li>
<li>熟悉 XXX 算法：<strong>XXX、XXX</strong>、XXX 与 XXX，具备 XXX 经验。</li>
<li>熟悉 <strong>XXX / XXX</strong> 框架，具备 XXX 建模、XXX 与 XXX 实操经验。</li>
<li>熟悉 XXX 前沿方向：XXX、<strong>XXX、XXX</strong>，了解 XXX 的完整流程。</li>
<li>熟悉 <strong>XXX</strong> 工具，具备基于 XXX 的训练、优化与部署经验。</li>
</ul>`;

const INTERN_HTML = `<p><strong>主要工作：</strong></p>
<ul>
<li>参与 XXX 系统的开发与联调，独立完成 XXX 模块，XXX 成功率达 <strong>XX%</strong>。</li>
<li>设计并实现基于 XXX 的 XXX 优化方案，将 XXX 降低 <strong>约 XX%</strong>。</li>
<li>参与 XXX 数据链路建设，累计产出有效数据 <strong>XXX+ 条</strong>。</li>
</ul>`;

const PROJECT_HTML = `<p><strong>项目简介：</strong>面向 XXX 场景，基于 XXX 框架完成 XXX 的设计、训练与部署。</p>
<p><strong>主要工作：</strong></p>
<ul>
<li>搭建 XXX 流水线，构建 <strong>XXX+ 条</strong>的自建数据集。</li>
<li>基于 XXX 完成 XXX 任务，将成功率从 XX% 提升至 <strong>XX%</strong>。</li>
<li>使用 XXX 完成 XXX 优化，XXX 从 XXms 降至 <strong>XXms</strong>。</li>
</ul>
<p><strong>技术栈：</strong>XXX、XXX、XXX、XXX</p>`;

const RESEARCH_HTML = `<p>研究方向为 <strong>XXX 与 XXX</strong>，参与 XXX 项目 X 项；以第 X 作者身份投稿 XXX 论文 X 篇，申请发明专利 X 项。</p>`;

const SELF_EVAL_HTML = `<p>具备扎实的 XXX 基础，能够独立完成从 XXX、XXX 到 XXX 的完整闭环。对 XXX 有持续的研究热情，学习能力强、工程落地意识好，能在快节奏的团队中快速交付结果。</p>`;

/** 一份内容完整的示例简历（首页预览与模板缩略图使用）；内容全部为占位文案 */
export function createSampleResume(): Resume {
  const now = Date.now();
  const sections: ResumeSection[] = createSectionsForTemplate('tpl-01');
  const replace = (type: ResumeSection['type'], sec: ResumeSection) => {
    const idx = sections.findIndex((s) => s.type === type);
    if (idx >= 0) sections[idx] = { ...sec, id: sections[idx].id, title: sections[idx].title };
  };

  replace(
    'education',
    section('education', '教育背景', 'list', {
      items: [
        item({
          name: 'XX大学',
          role: 'XX专业',
          label: '学历',
          labelValue: '硕士',
          startDate: '2024-09',
          endDate: '2027-06',
          content:
            '<p>主修课程：XXX、XXX、XXX、XXX；GPA X.X/4.0，专业排名前 XX%。</p>',
        }),
        item({
          name: 'XX大学',
          role: 'XX专业',
          label: '学历',
          labelValue: '本科',
          startDate: '2020-09',
          endDate: '2024-06',
          content: '<p>GPA X.X/4.0，专业排名前 XX%，连续三年获 XX 奖学金。</p>',
        }),
      ],
    }),
  );

  replace('skills', section('skills', '专业技能', 'rich', { content: SKILLS_HTML }));

  replace(
    'internship',
    section('internship', '实习经历', 'list', {
      items: [
        item({
          name: 'XX科技有限公司',
          role: 'XX实习生',
          startDate: '2025-06',
          endDate: '2025-09',
          content: INTERN_HTML,
        }),
      ],
    }),
  );

  replace(
    'project',
    section('project', '项目经历', 'list', {
      items: [
        item({
          name: 'XX项目（面向 XXX 场景）',
          role: '核心开发',
          startDate: '2024-09',
          endDate: '2025-05',
          content: PROJECT_HTML,
        }),
      ],
    }),
  );

  replace(
    'campus',
    section('campus', '校园经历', 'list', {
      items: [
        item({
          name: 'XX社团 / 学生会',
          role: 'XX职务',
          startDate: '2025-06',
          endDate: '2026-05',
          content: '<p>统筹组织 XXX 活动 X 场，累计参与人数 XXX+。</p>',
        }),
      ],
    }),
  );

  replace(
    'award',
    section('award', '获奖情况', 'list', {
      items: [
        item({ name: 'XX竞赛 一等奖', label: '获奖日期', labelValue: '2023-08' }),
        item({ name: 'XX竞赛 二等奖', label: '获奖日期', labelValue: '2024-11' }),
        item({ name: 'XX奖学金（连续三年）', label: '获奖日期', labelValue: '2021-2023' }),
      ],
    }),
  );

  replace(
    'research',
    section('research', '科研经历', 'list', {
      items: [
        item({
          name: 'XX研究方向',
          role: '核心成员',
          startDate: '2024-10',
          endDate: '',
          current: true,
          content: RESEARCH_HTML,
        }),
      ],
    }),
  );

  replace('selfEval', section('selfEval', '自我评价', 'rich', { content: SELF_EVAL_HTML }));

  return {
    id: 'sample-resume',
    name: 'XX工程师-校招版',
    createdAt: now,
    updatedAt: now,
    basic: {
      ...createEmptyBasicInfo(),
      name: 'Resume-Pan',
      gender: 'male',
      birthDate: '2002-01-01',
      showAgeOnly: true,
      workYears: '应届生',
      jobIntention: 'XX算法工程师',
      phone: '138-XXXX-XXXX',
      email: 'xxxx@example.com',
      politicalStatus: 'XX党员',
      customFields: [
        { id: 'cf-1', icon: 'Calendar', label: '实习时间', value: '2025.06 - 2025.09' },
      ],
    },
    sections,
    style: {
      ...createDefaultStyle('tpl-01'),
      // 对齐线上导出效果：头部信息用「图标 + 值」呈现
      infoMode: 'icon',
      fontScale: 1,
      spacing: { ...DEFAULT_SPACING },
    },
  };
}

export const SAMPLE_RESUME = createSampleResume();

import { DEFAULT_SPACING } from '@/data/design';
import { getTemplate } from '@/data/templates';
import { uid } from '@/lib/id';
import { isRichEmpty, plainText } from '@/lib/richText';
import type {
  BasicInfo,
  ModuleType,
  Resume,
  ResumeItem,
  ResumeSection,
  ResumeStyle,
} from '@/types/resume';

/** 各标准模块的默认标题与形态 */
export const SECTION_DEFS: Record<
  Exclude<ModuleType, 'custom'>,
  { title: string; kind: 'list' | 'rich'; itemLabel?: string; namePlaceholder?: string; rolePlaceholder?: string }
> = {
  education: {
    title: '教育背景',
    kind: 'list',
    itemLabel: '学历',
    namePlaceholder: '学校名称',
    rolePlaceholder: '专业',
  },
  skills: { title: '专业技能', kind: 'rich' },
  work: {
    title: '工作经历',
    kind: 'list',
    namePlaceholder: '公司名称',
    rolePlaceholder: '工作职位',
  },
  internship: {
    title: '实习经历',
    kind: 'list',
    namePlaceholder: '公司名称',
    rolePlaceholder: '职位名称',
  },
  project: {
    title: '项目经历',
    kind: 'list',
    namePlaceholder: '项目名称',
    rolePlaceholder: '项目角色',
  },
  campus: {
    title: '校园经历',
    kind: 'list',
    namePlaceholder: '组织名称',
    rolePlaceholder: '担任职务',
  },
  award: {
    title: '获奖情况',
    kind: 'list',
    itemLabel: '获奖日期',
    namePlaceholder: '奖项名称',
    rolePlaceholder: '颁发单位',
  },
  research: {
    title: '科研经历',
    kind: 'list',
    namePlaceholder: '研究方向',
    rolePlaceholder: '承担角色',
  },
  selfEval: { title: '自我评价', kind: 'rich' },
};

export const STANDARD_TYPES: Exclude<ModuleType, 'custom'>[] = [
  'education',
  'skills',
  'work',
  'internship',
  'project',
  'campus',
  'award',
  'research',
  'selfEval',
];

/** 新建一条空经历 */
export function createItem(type: ModuleType): ResumeItem {
  const def = type === 'custom' ? undefined : SECTION_DEFS[type];
  return {
    id: uid('it'),
    name: '',
    role: '',
    label: def?.itemLabel ?? '',
    labelValue: '',
    startDate: '',
    endDate: '',
    current: false,
    content: '',
  };
}

/** 新建一个内容模块 */
export function createSection(
  type: ModuleType,
  title?: string,
  id?: string,
): ResumeSection {
  const def = type === 'custom' ? undefined : SECTION_DEFS[type];
  const kind = def?.kind ?? 'rich';
  return {
    id: id ?? `sec-${type}-${uid('x')}`,
    type,
    title: title ?? def?.title ?? '自定义模块',
    visible: true,
    kind,
    items: kind === 'list' ? [] : [],
    content: '',
  };
}

export function createEmptyBasicInfo(): BasicInfo {
  return {
    avatar: '',
    name: '',
    gender: '',
    birthDate: '',
    showAgeOnly: false,
    workYears: '',
    jobIntention: '',
    phone: '',
    email: '',
    politicalStatus: '',
    customFields: [],
  };
}

export function createDefaultStyle(templateId: string): ResumeStyle {
  const tpl = getTemplate(templateId);
  return {
    templateId: tpl.id,
    theme: tpl.theme,
    font: 'default',
    fontScale: 1,
    language: 'zh',
    layout: tpl.layout,
    infoMode: tpl.infoMode,
    lineSpacing: 'standard',
    spacing: { ...DEFAULT_SPACING },
  };
}

/**
 * 模板自带的「默认文案引导」。
 * 对齐 PRD：「模板 = 版式 + 模块编排 + 默认文案引导」——新建简历不应是一张白纸，
 * 而要给出可直接修改的示范文案（XX 为待替换占位）。
 */
const GUIDE_ITEMS: Partial<Record<ModuleType, Partial<ResumeItem>>> = {
  education: {
    name: 'XX大学',
    role: 'XX专业',
    label: '学历',
    labelValue: '本科',
    content: '<p>主修课程：XXX、XXX、XXX；GPA X.X/5.0，专业排名前 XX%。</p>',
  },
  work: {
    name: 'XX科技有限公司',
    role: 'XX工程师',
    content:
      '<p><strong>主要工作：</strong></p><ul><li>负责 XXX 模块的设计与开发，通过 XXX 优化使 XXX 提升 XX%。</li><li>主导 XXX 项目，解决 XXX 问题，将 XXX 降低 XX%。</li></ul>',
  },
  internship: {
    name: 'XX科技有限公司',
    role: 'XX实习生',
    content:
      '<p><strong>主要工作：</strong></p><ul><li>参与 XXX 系统的开发与联调，独立完成 XXX 模块，XXX 成功率达 XX%。</li><li>基于 XXX 完成 XXX 优化，使 XXX 从 XX 提升至 XX。</li></ul>',
  },
  project: {
    name: 'XX项目',
    role: '核心开发',
    content:
      '<p><strong>项目简介：</strong>XXX（面向 XXX 场景，解决 XXX 问题）。</p><p><strong>主要工作：</strong></p><ul><li>独立完成 XXX 模块，通过 XXX 将 XXX 提升至 XX%。</li><li>使用 XXX 完成 XXX 优化，XXX 从 XX 降低至 XX。</li></ul><p><strong>技术栈：</strong>XXX、XXX、XXX</p>',
  },
  campus: {
    name: 'XX社团 / 学生会',
    role: 'XX职务',
    content: '<p>统筹组织 XXX 活动 X 场，累计参与人数 XXX+。</p>',
  },
  award: {
    name: 'XX竞赛 一等奖',
    label: '获奖日期',
    labelValue: '',
    content: '',
  },
  research: {
    name: 'XX研究方向',
    role: '核心成员',
    content: '<p>参与 XXX 项目 X 项；以第 X 作者投稿 XXX 论文 X 篇，申请发明专利 X 项。</p>',
  },
};

const GUIDE_RICH: Partial<Record<ModuleType, string>> = {
  skills:
    '<ul><li>熟练掌握 <strong>XXX、XXX、XXX</strong>，具备 XXX 开发经验。</li><li>熟悉 XXX 原理与 XXX 调优，有 XXX 实战经验。</li><li>具备 XXX 能力，能独立完成 XXX 到 XXX 的完整链路。</li></ul>',
  selfEval:
    '<p>具备扎实的 XXX 基础，能独立完成从 XXX 到 XXX 的完整闭环；有较强的 XXX 能力与 XXX 意识，能在快节奏团队中快速交付结果。</p>',
};

/** 给新简历的模块填充「默认文案引导」 */
export function withGuideContent(section: ResumeSection): ResumeSection {
  const item = GUIDE_ITEMS[section.type];
  if (item && section.kind === 'list') {
    const base = createItem(section.type);
    return { ...section, items: [{ ...base, ...item, id: base.id }] };
  }
  const rich = GUIDE_RICH[section.type];
  if (rich && section.kind === 'rich') {
    return { ...section, content: rich };
  }
  return section;
}

/** 按模板顺序构建全部标准模块（并填充默认文案引导） */
export function createSectionsForTemplate(templateId: string): ResumeSection[] {
  const tpl = getTemplate(templateId);
  const ordered = [
    ...tpl.sectionOrder,
    ...STANDARD_TYPES.filter((t) => !tpl.sectionOrder.includes(t)),
  ];
  return ordered.map((t) => withGuideContent(createSection(t)));
}

/** 新建简历 */
export function createResume(templateId: string, name = '未命名简历'): Resume {
  const now = Date.now();
  return {
    id: uid('res'),
    name,
    createdAt: now,
    updatedAt: now,
    basic: createEmptyBasicInfo(),
    sections: createSectionsForTemplate(templateId),
    style: createDefaultStyle(templateId),
  };
}

/** 只套用模板的「外观」（主题色 / 布局 / 信息展示），不改动模块顺序与内容 */
export function applyStyleOnly(resume: Resume, templateId: string): Resume {
  const tpl = getTemplate(templateId);
  return {
    ...resume,
    style: {
      ...resume.style,
      templateId: tpl.id,
      theme: tpl.theme,
      layout: tpl.layout,
      infoMode: tpl.infoMode,
    },
    updatedAt: Date.now(),
  };
}

/**
 * 切换模板：调整外观 + 按模板的叙事顺序重排模块，**完整保留全部已填内容**。
 *
 * 注意：不能用 `Map<type, section>` 归类——多个「自定义模块」的 type 同为 'custom'，
 * 相互覆盖会导致切模板时丢失模块。这里改为按模板顺序逐个「摘取」同类型模块，
 * 摘不到的模块按原相对顺序追加到末尾。
 */
export function applyTemplate(resume: Resume, templateId: string): Resume {
  const tpl = getTemplate(templateId);
  const remaining = [...resume.sections];
  const ordered: ResumeSection[] = [];

  for (const type of tpl.sectionOrder) {
    let idx = remaining.findIndex((s) => s.type === type);
    while (idx >= 0) {
      ordered.push(remaining.splice(idx, 1)[0]);
      idx = remaining.findIndex((s) => s.type === type);
    }
  }
  ordered.push(...remaining);

  return { ...applyStyleOnly(resume, templateId), sections: ordered };
}

/** 深拷贝（复制简历用） */
export function cloneResume(resume: Resume, name?: string): Resume {
  const now = Date.now();
  const copy: Resume = JSON.parse(JSON.stringify(resume));
  copy.id = uid('res');
  copy.name = name ?? `${resume.name} - 副本`;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.sections = copy.sections.map((s) => ({
    ...s,
    id: `sec-${s.type}-${uid('x')}`,
    items: s.items.map((it) => ({ ...it, id: uid('it') })),
  }));
  copy.basic.customFields = copy.basic.customFields.map((f) => ({ ...f, id: uid('f') }));
  return copy;
}

/** 模块是否已填写（用于步骤导航进度圆点） */
export function isSectionFilled(section: ResumeSection): boolean {
  if (section.kind === 'rich') return !isRichEmpty(section.content);
  return section.items.some(
    (it) => !!(it.name || it.role || it.labelValue || !isRichEmpty(it.content)),
  );
}

/** 模块在简历中是否可见（有内容且未被隐藏） */
export function isSectionVisible(section: ResumeSection): boolean {
  return section.visible && isSectionFilled(section);
}

/** 简历整体完成度 0~1 */
export function resumeProgress(resume: Resume): number {
  if (!resume.sections.length) return 0;
  const filled = resume.sections.filter(isSectionFilled).length;
  return filled / resume.sections.length;
}

/** 求职意向是否已填 */
export function hasJobIntention(resume: Resume): boolean {
  return plainText(resume.basic.jobIntention).length > 0;
}

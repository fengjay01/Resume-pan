import type { ModuleType, SectionHeadingStyle, TemplateMeta } from '@/types/resume';

/**
 * 模板库按「种类」组织：3 种版式（标题形态）× 校招/社招两种叙事 = 6 款模板。
 *
 * 颜色不作为模板差异 —— 用户可在编辑器「样式 → 主题色」里自由更换 8 种颜色，
 * 因此不再提供「同一版式、不同颜色」的重复模板（此前 22 款里有大量仅换色的变体）。
 * 章节标题形态由模板的默认主题决定（见 tokens.ts 的 buildTokens）。
 */

/** 校招：教育背景前置，工作经历在实习/项目之前（与线上模块导航一致） */
const ORDER_CAMPUS: ModuleType[] = [
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
/** 社招：技能 - 履历 - 项目 黄金三段式 */
const ORDER_SOCIAL: ModuleType[] = [
  'skills',
  'work',
  'project',
  'education',
  'internship',
  'campus',
  'award',
  'research',
  'selfEval',
];

interface Seed {
  name: string;
  /** 章节标题形态（模板身份特征） */
  heading: SectionHeadingStyle;
  styleName: string;
  styleDesc: string;
  tags: string[];
  desc: string;
  order?: ModuleType[];
  theme?: TemplateMeta['theme'];
  layout?: TemplateMeta['layout'];
  infoMode?: TemplateMeta['infoMode'];
  avatar?: boolean;
  /** 页面顶部通栏色条（模板级装饰） */
  topBar?: boolean;
}

const SEEDS: Seed[] = [
  // ---- 版式一：色块标题 ----
  {
    name: '色块标题简历模板',
    heading: 'label',
    styleName: '经典蓝',
    styleDesc: '主题色色块章节标题，简洁专业，适合大多数技术岗位',
    tags: ['校招', '实习', '社招', '后端开发', '前端开发'],
    desc: '章节标题采用主题色色块 + 白字，醒目清晰；整体版式简洁专业，适合大多数校招与社招技术岗位。',
    order: ORDER_CAMPUS,
    theme: 'blue',
  },

  // ---- 版式二：下划线标题 ----
  {
    name: '下划线标题简历模板',
    heading: 'rule',
    styleName: '橙色简洁',
    styleDesc: '主题色下划线分节，强调重点，阅读节奏清晰',
    tags: ['校招', '社招', '产品经理', '运营'],
    desc: '章节标题使用主题色文字 + 下划线分节，强调重点、阅读节奏清晰，适合技术/产品/运营等各类岗位。',
    order: ORDER_CAMPUS,
    theme: 'orange',
    infoMode: 'icon',
  },

  // ---- 版式三：左竖条标题 ----
  {
    name: '竖条标题简历模板',
    heading: 'bar',
    styleName: '竖条简约',
    styleDesc: '主题色左竖线 + 主题色标题，干净利落',
    tags: ['校招', '社招', '后端开发'],
    desc: '章节标题左侧使用主题色竖线，配合主题色标题文字，干净利落不花哨，适合追求沉稳版式的求职者。',
    order: ORDER_CAMPUS,
    theme: 'green',
  },

  // ---- 版式四：图标 + 横线标题 ----
  {
    name: '图标标题简历模板',
    heading: 'iconline',
    styleName: '图标线条',
    styleDesc: '主题色圆形图标 + 整宽横线分节，结构清晰',
    tags: ['校招', '社招', '前端开发', '产品经理'],
    desc: '每个章节标题左侧配有主题色圆形图标，下方整宽横线分节，结构一目了然，是中文简历里最经典的版式之一。',
    order: ORDER_CAMPUS,
    theme: 'cyan',
    infoMode: 'icon',
    topBar: true,
  },

  // ---- 版式五：极简黑白 ----
  {
    name: '极简黑白简历模板',
    heading: 'plain',
    styleName: '极简灰',
    styleDesc: '纯黑白灰、无装饰，信息密度高',
    tags: ['校招', '社招', '后端开发', '嵌入式'],
    desc: '纯黑白灰、无任何装饰的极简版式，信息密度高，打印与机器解析都友好，适合内容优先的求职者。',
    order: ORDER_CAMPUS,
    theme: 'gray',
  },

  // ---- 版式六：平行四边形标题 ----
  {
    name: '平行四边形简历模板',
    heading: 'skew',
    styleName: '平行四边形',
    styleDesc: '主题色斜切色块标题，个性醒目',
    tags: ['校招', '社招', '前端开发', '运营'],
    desc: '章节标题采用主题色平行四边形色块 + 白字，斜切造型个性醒目，适合想在版式上加点设计感的求职者。',
    order: ORDER_CAMPUS,
    theme: 'blue',
  },
];

export const TEMPLATES: TemplateMeta[] = SEEDS.map((s, i) => ({
  id: `tpl-${String(i + 1).padStart(2, '0')}`,
  name: s.name,
  description: s.desc,
  tags: s.tags,
  styleName: s.styleName,
  styleDesc: s.styleDesc,
  // 章节标题形态：模板显式声明（模板身份特征，不随用户换主题色变化）
  heading: s.heading,
  theme: s.theme ?? 'blue',
  // 头部信息默认居中（头像仍在右上角）；用户可在「样式 → 布局调整」切换为居左/平铺
  layout: s.layout ?? 'center',
  // 头部信息默认用「小图标 + 值」呈现（不写出「性别：」这类标签）；可在「样式 → 信息展示」切换
  infoMode: s.infoMode ?? 'icon',
  sectionOrder: s.order ?? ORDER_CAMPUS,
  // 全部模板都支持头像：上传后即展示（此前默认 false 会让大多数模板不显示头像）
  showAvatar: s.avatar ?? true,
  // 页面顶部通栏色条（仅部分模板声明，如「图标线条」）
  topBar: s.topBar === true,
}));

export const TEMPLATE_MAP: Record<string, TemplateMeta> = TEMPLATES.reduce(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {},
);

export const getTemplate = (id: string): TemplateMeta =>
  TEMPLATE_MAP[id] ?? TEMPLATES[0];

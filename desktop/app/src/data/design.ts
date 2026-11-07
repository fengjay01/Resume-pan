import type {
  FontKey,
  SectionHeadingStyle,
  InfoMode,
  LayoutKey,
  LineSpacingKey,
  SpacingConfig,
  ThemeKey,
} from '@/types/resume';

/** 8 色主题色板（样式设置） */
export interface ThemeToken {
  key: ThemeKey;
  label: string;
  /** 主色（标题/图标/分隔/进度） */
  primary: string;
  /** 主色浅色背景（章节标签底色 / 头像圈） */
  soft: string;
  /** 章节标题形态（由模板决定） */
  headingStyle: SectionHeadingStyle;
}

export const THEMES: ThemeToken[] = [
  // 主色对齐线上导出（经典蓝 #2b7bcd）
  { key: 'blue', label: '蓝', primary: '#2b7bcd', soft: '#e8f0fb', headingStyle: 'label' },
  { key: 'orange', label: '橙', primary: '#e8590c', soft: '#fff0e6', headingStyle: 'rule' },
  { key: 'green', label: '绿', primary: '#0f9d58', soft: '#e6f6ee', headingStyle: 'bar' },
  { key: 'purple', label: '紫', primary: '#6d28d9', soft: '#f1e9fe', headingStyle: 'label' },
  { key: 'red', label: '红', primary: '#d92d20', soft: '#feeceb', headingStyle: 'rule' },
  { key: 'cyan', label: '青', primary: '#0e7490', soft: '#e0f2f6', headingStyle: 'bar' },
  { key: 'gray', label: '灰', primary: '#475569', soft: '#eef1f5', headingStyle: 'plain' },
  { key: 'black', label: '黑', primary: '#111827', soft: '#eceef2', headingStyle: 'label' },
];

export const THEME_MAP: Record<ThemeKey, ThemeToken> = THEMES.reduce(
  (acc, t) => ({ ...acc, [t.key]: t }),
  {} as Record<ThemeKey, ThemeToken>,
);

/** 5 款字体（文字设置） */
export const FONTS: {
  key: FontKey;
  label: string;
  stack: string;
  /** 简历纸张内生效的字族 */
  resumeStack: string;
}[] = [
  {
    key: 'default',
    label: '默认黑体',
    // 默认 Noto Sans SC（思源黑体同源）：Web Font 全平台渲染一致。
    // 此前默认微软雅黑是系统字体，各平台字形/度量有差异；改为 Web Font 后
    // 预览与导出（浏览器排版引擎内嵌同一份字体文件）逐字形一致（2026-10 改）。
    stack: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
    resumeStack: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
  },
  {
    key: 'sourceHanSans',
    label: '思源黑体',
    stack: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif',
    resumeStack: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif',
  },
  {
    key: 'sourceHanSerif',
    label: '思源宋体',
    stack: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif',
    resumeStack: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif',
  },
  {
    key: 'lxgw',
    label: '霞鹜文楷',
    stack: '"LXGW WenKai", "Kaiti SC", "STKaiti", cursive',
    resumeStack: '"LXGW WenKai", "Kaiti SC", "STKaiti", cursive',
  },
  {
    key: 'interSourceHan',
    label: 'Inter + 思源黑体',
    stack: 'Inter, "Source Han Sans SC", "PingFang SC", sans-serif',
    resumeStack: 'Inter, "Source Han Sans SC", "PingFang SC", sans-serif',
  },
];

export const FONT_MAP = FONTS.reduce(
  (acc, f) => ({ ...acc, [f.key]: f }),
  {} as Record<FontKey, (typeof FONTS)[number]>,
);

/** 行间距档位 */
export const LINE_SPACING: { key: LineSpacingKey; label: string; value: number }[] = [
  { key: 'compact', label: '紧凑', value: 1.3 },
  { key: 'standard', label: '标准', value: 1.55 },
  { key: 'loose', label: '宽松', value: 1.85 },
];

export const LAYOUTS: { key: LayoutKey; label: string }[] = [
  { key: 'left', label: '居左' },
  { key: 'center', label: '居中' },
  { key: 'tile', label: '平铺' },
];

export const INFO_MODES: { key: InfoMode; label: string }[] = [
  { key: 'text', label: '文字' },
  { key: 'icon', label: '图标' },
  { key: 'plain', label: '纯内容' },
];

/** 默认间距（用户校准版：模块间距 16、行距 1.85、左右 40、上 40、下 35） */
export const DEFAULT_SPACING: SpacingConfig = {
  sectionGap: 16,
  lineHeight: 1.85,
  marginX: 40,
  marginTop: 40,
  marginBottom: 35,
};

/** 工作年限枚举（编辑器下拉） */
export const WORK_YEARS = [
  '应届生',
  '半年经验',
  ...Array.from({ length: 19 }, (_, i) => `${i + 1}年经验`),
  '20年以上经验',
];

/** 学历枚举 */
export const DEGREES = ['大专', '本科', '硕士', '博士'];

/** 性别 */
export const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];

/** 模板分类标签（16 类） */
export const CATEGORIES = [
  '全部',
  'Java',
  '后端开发',
  '校招',
  '实习',
  '社招',
  '大模型算法',
  'Go',
  'C++',
  '嵌入式',
  '测试开发',
  '前端开发',
  'AI应用开发',
  'Python',
  '大学生',
  '运营',
  '产品经理',
];

/** A4 尺寸（96dpi 下的像素值），渲染引擎与编辑器统一使用 */
export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

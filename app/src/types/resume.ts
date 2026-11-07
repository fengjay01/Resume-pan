/**
 * Resume-Pan —— 核心数据模型（所有开发模块共享的接口契约，请勿擅自变更字段语义）
 */

/* ----------------------------- 外观与样式 ----------------------------- */

/** 主题色 8 色（样式设置） */
export type ThemeKey =
  | 'blue'
  | 'orange'
  | 'green'
  | 'purple'
  | 'red'
  | 'cyan'
  | 'gray'
  | 'black';

/** 章节标题形态（由模板决定，不随主题色变化） */
export type SectionHeadingStyle =
  | 'label'
  | 'bar'
  | 'rule'
  | 'plain'
  | 'iconline'
  | 'skew';

/** 字体 5 款精选（文字设置） */
export type FontKey =
  | 'default'
  | 'sourceHanSans'
  | 'sourceHanSerif'
  | 'lxgw'
  | 'interSourceHan';

/** 布局方式：居左 / 居中 / 平铺 */
export type LayoutKey = 'left' | 'center' | 'tile';

/** 信息展示模式：文字 / 图标 / 纯内容 */
export type InfoMode = 'text' | 'icon' | 'plain';

/** 简历语言 */
export type ResumeLanguage = 'zh' | 'en';

/** 行间距档位（文字设置） */
export type LineSpacingKey = 'compact' | 'standard' | 'loose';

/** 间距设置（五项滑杆） */
export interface SpacingConfig {
  /** 模块上下间距 px */
  sectionGap: number;
  /** 行间距倍数 */
  lineHeight: number;
  /** 左右边距 px */
  marginX: number;
  /** 上边距 px */
  marginTop: number;
  /** 下边距 px */
  marginBottom: number;
}

/** 简历外观配置 */
export interface ResumeStyle {
  /** 当前模板 id（对应 data/templates.ts） */
  templateId: string;
  theme: ThemeKey;
  /** 自定义主题色（hex，如 '#a855f7'）。设置后优先于 theme 的预设色；清除则回退预设 */
  themeCustom?: string;
  font: FontKey;
  /** 字号百分比，0.8 ~ 1.15（如 0.9 表示 90%） */
  fontScale: number;
  language: ResumeLanguage;
  layout: LayoutKey;
  infoMode: InfoMode;
  lineSpacing: LineSpacingKey;
  spacing: SpacingConfig;
}

/* ------------------------------- 内容模块 ------------------------------- */

export type ModuleType =
  | 'education'
  | 'skills'
  | 'work'
  | 'internship'
  | 'project'
  | 'campus'
  | 'award'
  | 'research'
  | 'selfEval'
  | 'custom';

/** 条目式模块中的单条经历 */
export interface ResumeItem {
  id: string;
  /** 主名称：学校 / 公司 / 项目名 / 奖项名 / 组织名 */
  name: string;
  /** 次名称：专业 / 职位 / 角色 */
  role: string;
  /** 结构化补充字段标签（如「研究方向」「学历」） */
  label: string;
  /** 结构化补充字段值 */
  labelValue: string;
  /** 开始时间（YYYY-MM，空表示未填） */
  startDate: string;
  /** 结束时间（YYYY-MM） */
  endDate: string;
  /** 是否「至今」 */
  current: boolean;
  /** 富文本描述（HTML 字符串） */
  content: string;
}

/**
 * 内容模块。
 * - kind = 'list'：可重复条目（教育/工作/实习/项目/校园/获奖/科研）
 * - kind = 'rich'：单个富文本块（专业技能/自我评价）
 */
export interface ResumeSection {
  id: string;
  type: ModuleType;
  /** 模块显示名（可重命名） */
  title: string;
  /** 是否在简历中显示 */
  visible: boolean;
  kind: 'list' | 'rich';
  items: ResumeItem[];
  /** kind === 'rich' 时使用 */
  content: string;
}

/* ------------------------------- 基本信息 ------------------------------- */

export interface BasicInfoCustomField {
  id: string;
  /** lucide 图标名 */
  icon: string;
  /** 标签，如「实习时间」 */
  label: string;
  /** 具体内容 */
  value: string;
}

export interface BasicInfo {
  /** 头像 dataURL（选填） */
  avatar: string;
  name: string;
  gender: 'male' | 'female' | '';
  /** 出生日期 YYYY-MM-DD */
  birthDate: string;
  /** 只显示年龄（不显示出生日期） */
  showAgeOnly: boolean;
  /** 工作年限枚举值 */
  workYears: string;
  jobIntention: string;
  phone: string;
  email: string;
  politicalStatus: string;
  /** 自定义/更多信息 */
  customFields: BasicInfoCustomField[];
}

/* --------------------------------- 简历 --------------------------------- */

export interface Resume {
  id: string;
  /** 简历名称 */
  name: string;
  createdAt: number;
  updatedAt: number;
  basic: BasicInfo;
  sections: ResumeSection[];
  style: ResumeStyle;
  /** 是否置顶（置顶简历始终排在最前，数量不限） */
  pinned?: boolean;
  /** 置顶时间（用于给置顶组排序：后置顶的更靠前） */
  pinnedAt?: number;
}

/* ------------------------------ 模板与账号 ------------------------------ */

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** 所属风格名（对应 /api/template-styles） */
  styleName: string;
  /** 风格说明文案 */
  styleDesc: string;
  /** 该模板默认主题色 */
  theme: ThemeKey;
  /** 章节标题形态（模板身份特征，不随用户换主题色变化） */
  heading: SectionHeadingStyle;
  /** 该模板默认布局 */
  layout: LayoutKey;
  /** 该模板默认信息展示模式 */
  infoMode: InfoMode;
  /** 默认模块顺序（section type 顺序） */
  sectionOrder: ModuleType[];
  /** 是否展示头像 */
  showAvatar: boolean;
  /** 页面顶部通栏色条（模板级装饰，如「图标线条」版式） */
  topBar?: boolean;
}

export interface User {
  id: string;
  nickname: string;
  createdAt: number;
}

/** 保存状态 */
export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * 回收站条目：删除的简历不立即销毁，先放进回收站，30 天内可恢复。
 */
export interface TrashedResume {
  /** 被删除的简历（原样保留，恢复后与删除前完全一致） */
  resume: Resume;
  /** 移入回收站的时间戳（毫秒）—— 满 30 天自动彻底删除 */
  deletedAt: number;
  /** 删除前在列表中的位置，恢复时尽量放回原位 */
  index: number;
}

/** 回收站保留时长：30 天 */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

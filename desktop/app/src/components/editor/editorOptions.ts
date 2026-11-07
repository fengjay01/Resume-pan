import {
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  Flag,
  Globe,
  GraduationCap,
  IdCard,
  Link as LinkIcon,
  Mail,
  MapPin,
  Phone,
  Rocket,
  Star,
  Target,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModuleType } from '@/types/resume';

/** 所有内容模块共用的引导语 */
export const MODULE_GUIDE = '填写后会自动排版在简历上，不需要的信息可以选择不填或删除内容。';

/** 「自定义/更多信息」可选的 lucide 图标（约 20 个） */
export const ICON_OPTIONS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: 'Calendar', label: '日期', Icon: Calendar },
  { name: 'Briefcase', label: '工作', Icon: Briefcase },
  { name: 'Star', label: '收藏', Icon: Star },
  { name: 'Flag', label: '目标', Icon: Flag },
  { name: 'Phone', label: '电话', Icon: Phone },
  { name: 'Mail', label: '邮箱', Icon: Mail },
  { name: 'MapPin', label: '地点', Icon: MapPin },
  { name: 'Link', label: '链接', Icon: LinkIcon },
  { name: 'GraduationCap', label: '学历', Icon: GraduationCap },
  { name: 'Trophy', label: '奖杯', Icon: Trophy },
  { name: 'Award', label: '奖项', Icon: Award },
  { name: 'BookOpen', label: '阅读', Icon: BookOpen },
  { name: 'Users', label: '团队', Icon: Users },
  { name: 'User', label: '个人', Icon: User },
  { name: 'Clock', label: '时间', Icon: Clock },
  { name: 'Globe', label: '主页', Icon: Globe },
  { name: 'IdCard', label: '证件', Icon: IdCard },
  { name: 'FileText', label: '文档', Icon: FileText },
  { name: 'Target', label: '技能', Icon: Target },
  { name: 'Rocket', label: '项目', Icon: Rocket },
];

export const ICON_MAP: Record<string, LucideIcon> = ICON_OPTIONS.reduce<Record<string, LucideIcon>>(
  (acc, item) => {
    acc[item.name] = item.Icon;
    return acc;
  },
  {},
);

/** 图标名 → 组件（未知图标回退 FileText） */
export function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? FileText;
}

export interface ModuleFieldConfig {
  /** 时间区间字段标签：在校时间 / 工作时间 / … */
  timeLabel: string;
  /** 主名称输入框 placeholder */
  namePlaceholder: string;
  /** 次名称（角色）输入框 placeholder */
  rolePlaceholder: string;
  /** 富文本描述左标题（无则不加标签） */
  descLabel?: string;
  /** 富文本 placeholder */
  contentPlaceholder: string;
}

/** 各内容模块的字段文案配置 */
export const MODULE_FIELD_CONFIG: Record<ModuleType, ModuleFieldConfig> = {
  education: {
    timeLabel: '在校时间',
    namePlaceholder: '请输入学校名称',
    rolePlaceholder: '请输入专业',
    contentPlaceholder: '请输入在校经历、主修课程、绩点排名等',
  },
  skills: {
    timeLabel: '时间',
    namePlaceholder: '',
    rolePlaceholder: '',
    contentPlaceholder: '请输入专业技能',
  },
  work: {
    timeLabel: '工作时间',
    namePlaceholder: '请输入公司名称',
    rolePlaceholder: '请输入职位',
    contentPlaceholder: '请输入工作描述和主要成就',
  },
  internship: {
    timeLabel: '实习时间',
    namePlaceholder: '请输入公司名称',
    rolePlaceholder: '请输入职位名称',
    descLabel: '实习描述',
    contentPlaceholder: '请输入实习内容（选填）',
  },
  project: {
    timeLabel: '项目时间',
    namePlaceholder: '请输入项目名称',
    rolePlaceholder: '请输入项目角色',
    descLabel: '项目描述',
    contentPlaceholder: '请输入项目描述、技术栈和主要成就',
  },
  campus: {
    timeLabel: '时间',
    namePlaceholder: '请输入组织名称',
    rolePlaceholder: '请输入担任职务',
    contentPlaceholder: '请输入校园经历描述',
  },
  award: {
    timeLabel: '获奖时间',
    namePlaceholder: '请输入奖项名称',
    rolePlaceholder: '请输入颁发单位（选填）',
    contentPlaceholder: '请输入获奖描述（选填）',
  },
  research: {
    timeLabel: '时间',
    namePlaceholder: '请输入研究方向',
    rolePlaceholder: '请输入承担角色（选填）',
    contentPlaceholder: '请输入科研经历描述',
  },
  selfEval: {
    timeLabel: '时间',
    namePlaceholder: '',
    rolePlaceholder: '',
    contentPlaceholder: '请输入自我评价',
  },
  custom: {
    timeLabel: '时间',
    namePlaceholder: '请输入名称',
    rolePlaceholder: '请输入内容',
    contentPlaceholder: '请输入自定义模块内容，支持富文本编辑',
  },
};

/** 左侧设置栏标签 */
export type SettingTab = 'template' | 'text' | 'style' | 'spacing';

/** 预览区默认底板色（对照截图 05/22 的深色画布） */
export const PREVIEW_BG = '#414d61';

/** 字号预设 */
export const FONT_SCALE_PRESETS: { label: string; value: number }[] = [
  { label: '小', value: 0.85 },
  { label: '标准', value: 1 },
  { label: '大', value: 1.15 },
];

/** 缩放可选档位 */
export const ZOOM_PRESETS = [0.5, 0.75, 0.8, 0.9, 1, 1.25, 1.5];

import { FONT_MAP, THEME_MAP } from '@/data/design';
import { getTemplate } from '@/data/templates';
import type { ResumeStyle, SectionHeadingStyle } from '@/types/resume';

/** 渲染层使用的设计令牌（由简历外观配置推导，纯函数、无副作用） */
export interface RenderTokens {
  /** 主题主色 */
  primary: string;
  /** 主题浅色 */
  soft: string;
  /** 章节标题形态（由模板决定） */
  heading: SectionHeadingStyle;
  /** 简历纸张内字族 */
  fontFamily: string;
  /** 基准字号 px（14 * fontScale） */
  fs: number;
  /** 行高倍数 */
  lineHeight: number;
  sectionGap: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
}

/** hex（#rgb / #rrggbb）→ rgb 数组；非法输入返回 null */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 自定义主题色 → 浅色变体（与白色按 88% 混合），用作 soft 背景 */
function lighten(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const mixed = rgb.map((c) => Math.round(c + (255 - c) * 0.88));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function buildTokens(style: ResumeStyle): RenderTokens {
  const theme = THEME_MAP[style.theme];
  const font = FONT_MAP[style.font];
  const scale = style.fontScale > 0 ? style.fontScale : 1;
  const sp = style.spacing;
  // 自定义调色优先：合法 hex 时覆盖预设主题色（soft 自动生成浅色变体）
  const custom = style.themeCustom?.trim();
  const primary = custom && hexToRgb(custom) ? custom : theme.primary;
  const soft = (custom && hexToRgb(custom) ? lighten(custom) : null) ?? theme.soft;
  // 章节标题样式是「模板」的身份特征，跟随模板的默认主题，
  // 不随用户挑选的主题色变化 —— 否则同一个模板换个颜色，标题会从
  // 色块变成下划线，整个风格都变了（与线上产品行为一致：换色只换色）。
  const template = getTemplate(style.templateId);
  return {
    primary,
    soft,
    heading: template.heading ?? THEME_MAP[template.theme].headingStyle,
    fontFamily: font.resumeStack,
    fs: 14 * scale,
    lineHeight: sp.lineHeight,
    sectionGap: sp.sectionGap,
    marginX: sp.marginX,
    marginTop: sp.marginTop,
    marginBottom: sp.marginBottom,
  };
}

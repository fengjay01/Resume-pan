import { THEME_MAP } from '@/data/design';
import type { LayoutKey, TemplateMeta } from '@/types/resume';

/**
 * 模板线框预览图。
 * 对照线上编辑器「选择模板」面板：每个风格用一张抽象版式示意图表示
 * （深色块=标题、细条=正文、主题色块=章节标题），而不是渲染用户自己的简历——
 * 否则简历为空时所有缩略图都是白纸。
 */
export function TemplateWireframe({
  template,
  className,
}: {
  template: TemplateMeta;
  className?: string;
}) {
  const token = THEME_MAP[template.theme];
  const primary = token.primary;
  const soft = token.soft;
  // 标题形态：模板显式声明优先，缺省回退其默认主题
  const heading = template.heading ?? token.headingStyle;
  const layout: LayoutKey = template.layout;

  const MX = 48;
  const CW = 794 - MX * 2; // 内容宽度
  const INK = '#1f2937';
  const LINE = '#e5e7eb';
  const GRAY = '#9ca3af';

  // 章节：从 y=190 起，6 段
  const sections = Array.from({ length: 6 }, (_, i) => 190 + i * 145);

  const lines = (y: number) =>
    [CW, CW * 0.86, CW * 0.68].map((w, i) => (
      <rect key={i} x={MX} y={y + 40 + i * 19} width={w} height={10} rx={3} fill={LINE} />
    ));

  const headingNode = (y: number, key: number) => {
    if (heading === 'label') {
      return (
        <g key={key}>
          <rect x={MX} y={y} width={104} height={24} rx={4} fill={primary} />
          <rect x={MX + 12} y={y + 7} width={80} height={10} rx={3} fill="#ffffff" opacity={0.92} />
        </g>
      );
    }
    if (heading === 'bar') {
      return (
        <g key={key}>
          <rect x={MX} y={y + 1} width={5} height={22} rx={2.5} fill={primary} />
          <rect x={MX + 16} y={y + 5} width={96} height={14} rx={4} fill={primary} opacity={0.9} />
        </g>
      );
    }
    if (heading === 'iconline') {
      return (
        <g key={key}>
          <circle cx={MX + 10} cy={y + 12} r={10} fill={primary} />
          <rect x={MX + 27} y={y + 5} width={96} height={14} rx={4} fill={INK} />
          <rect x={MX} y={y + 28} width={CW} height={2.5} fill={primary} opacity={0.5} />
        </g>
      );
    }
    if (heading === 'skew') {
      // 平行四边形色块（skewX -12°：高 22 → 水平错位约 4.7px）
      return (
        <g key={key}>
          <polygon
            points={`${MX + 6},${y + 2} ${MX + 108},${y + 2} ${MX + 102},${y + 24} ${MX},${y + 24}`}
            fill={primary}
          />
          <rect x={MX + 18} y={y + 8} width={70} height={10} rx={3} fill="#ffffff" opacity={0.92} />
        </g>
      );
    }
    if (heading === 'rule') {
      return (
        <g key={key}>
          <rect x={MX} y={y + 2} width={112} height={16} rx={4} fill={primary} />
          <rect x={MX} y={y + 28} width={CW} height={2.5} fill={primary} opacity={0.35} />
        </g>
      );
    }
    // plain
    return (
      <g key={key}>
        <rect x={MX} y={y + 3} width={104} height={15} rx={4} fill={GRAY} />
        <rect x={MX} y={y + 28} width={CW} height={1.6} fill={LINE} />
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 794 1123"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${template.styleName} 版式预览`}
    >
      <rect x={0} y={0} width={794} height={1123} fill="#ffffff" />

      {/* 模板顶部通栏色条（对照参考稿「图标线条」版式） */}
      {template.topBar && <rect x={0} y={0} width={794} height={9} fill={primary} />}

      {/* ---------- 头部 ---------- */}
      {layout === 'center' ? (
        <>
          <rect x={(794 - 168) / 2} y={56} width={168} height={30} rx={6} fill={INK} />
          <rect x={794 - MX - 96} y={52} width={96} height={96} rx={10} fill={soft} />
          <rect x={(794 - 300) / 2} y={104} width={300} height={10} rx={3} fill={GRAY} opacity={0.55} />
          <rect x={(794 - 240) / 2} y={124} width={240} height={10} rx={3} fill={GRAY} opacity={0.55} />
        </>
      ) : layout === 'tile' ? (
        <>
          <rect x={MX} y={56} width={172} height={30} rx={6} fill={INK} />
          <rect x={794 - MX - 96} y={52} width={96} height={96} rx={10} fill={soft} />
          <g>
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={MX + i * ((CW * 0.62) / 4)}
                y={106}
                width={(CW * 0.62) / 4 - 14}
                height={10}
                rx={3}
                fill={GRAY}
                opacity={0.5}
              />
            ))}
          </g>
          <rect x={MX} y={132} width={CW * 0.9} height={1.6} fill={LINE} />
        </>
      ) : (
        <>
          <rect x={MX} y={56} width={172} height={30} rx={6} fill={INK} />
          <rect x={794 - MX - 96} y={52} width={96} height={96} rx={10} fill={soft} />
          <rect x={MX} y={106} width={300} height={10} rx={3} fill={GRAY} opacity={0.55} />
          <rect x={MX} y={126} width={230} height={10} rx={3} fill={GRAY} opacity={0.55} />
        </>
      )}

      {/* ---------- 章节 ---------- */}
      {sections.map((y, i) => (
        <g key={y}>
          {headingNode(y, i)}
          {heading === 'rule' ? lines(y + 16) : lines(y)}
        </g>
      ))}
    </svg>
  );
}

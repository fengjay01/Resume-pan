import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Award,
  Briefcase,
  Calendar,
  Clock,
  FlaskConical,
  Flag,
  FolderOpen,
  Globe,
  GraduationCap,
  Info,
  Link as LinkIcon,
  Mail,
  MapPin,
  Phone,
  Rocket,
  Star,
  Tag,
  Target,
  User,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { calcAge, formatMonth, formatRange } from '@/lib/format';
import { isSectionVisible } from '@/lib/resume';
import { normalizeRichHtml } from '@/lib/normalizeRich';
import { plainText } from '@/lib/richText';
import type { ModuleType, BasicInfo, Resume, ResumeItem, ResumeSection } from '@/types/resume';
import type { RenderTokens } from './tokens';

/* ----------------------------- 原子块定义 ----------------------------- */

export interface Block {
  key: string;
  node: ReactNode;
  /** 该块不是页面首块时的上边距（px） */
  gapBefore: number;
}

const ICONS: Record<string, LucideIcon> = {
  Award,
  Briefcase,
  Calendar,
  Clock,
  Flag,
  Globe,
  GraduationCap,
  Info,
  Link: LinkIcon,
  Mail,
  MapPin,
  Phone,
  Star,
  Tag,
  Target,
  User,
};

function FieldIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const Cmp = ICONS[name] ?? Info;
  return <Cmp size={size} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />;
}

/** 各内容模块对应的章节图标（「图标线条」版式的标题左侧使用；「添加模块」选择器也用它） */
export const SECTION_ICONS: Partial<Record<ModuleType, LucideIcon>> = {
  education: GraduationCap,
  skills: Target,
  work: Briefcase,
  internship: Rocket,
  project: FolderOpen,
  campus: Users,
  award: Award,
  research: FlaskConical,
  selfEval: User,
  custom: Tag,
};

/* ----------------------------- 基本信息 ----------------------------- */

interface InfoField {
  key: string;
  icon: string;
  label: string;
  value: string;
}

/**
 * 头部信息字段顺序，对齐线上导出效果：
 * 性别 → 工作年限 → 求职意向 → 出生日期（年龄） → 政治面貌 → 自定义字段
 */
function buildInfoFields(basic: BasicInfo): InfoField[] {
  const out: InfoField[] = [];
  const push = (key: string, icon: string, label: string, value: string) => {
    const v = (value || '').trim();
    if (v) out.push({ key, icon, label, value: v });
  };

  const gender = basic.gender === 'male' ? '男' : basic.gender === 'female' ? '女' : '';
  push('gender', 'User', '性别', gender);
  push('workYears', 'Briefcase', '工作年限', basic.workYears);
  push('jobIntention', 'Target', '求职意向', basic.jobIntention);

  const age = calcAge(basic.birthDate);
  if (basic.showAgeOnly) {
    if (age != null) push('age', 'Calendar', '年龄', `${age}岁`);
  } else if (basic.birthDate) {
    const bd = formatMonth(basic.birthDate.slice(0, 7));
    push('age', 'Calendar', '出生日期', age != null ? `${bd}（${age}岁）` : bd);
  } else if (age != null) {
    push('age', 'Calendar', '年龄', `${age}岁`);
  }

  push('politicalStatus', 'Flag', '政治面貌', basic.politicalStatus);
  basic.customFields.forEach((f) => push(`cf-${f.id}`, f.icon || 'Info', f.label, f.value));
  return out;
}

function buildContactFields(basic: BasicInfo): InfoField[] {
  const out: InfoField[] = [];
  const phone = (basic.phone || '').trim();
  const email = (basic.email || '').trim();
  if (phone) out.push({ key: 'phone', icon: 'Phone', label: '', value: phone });
  if (email) out.push({ key: 'email', icon: 'Mail', label: '', value: email });
  return out;
}

function FieldView({
  field,
  mode,
  tokens,
}: {
  field: InfoField;
  mode: Resume['style']['infoMode'];
  tokens: RenderTokens;
}) {
  if (mode === 'icon') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', color: '#000000' }}>
        <FieldIcon name={field.icon} size={tokens.fs} color="#333333" />
        <span style={{ marginLeft: tokens.fs * 0.42 }}>{field.value}</span>
      </span>
    );
  }
  if (mode === 'text' && field.label) {
    return (
      <span style={{ color: '#000000' }}>
        {field.label}：{field.value}
      </span>
    );
  }
  return <span style={{ color: '#000000' }}>{field.value}</span>;
}

function InfoLine({
  fields,
  mode,
  tokens,
  separator,
}: {
  fields: InfoField[];
  mode: Resume['style']['infoMode'];
  tokens: RenderTokens;
  /** 自定义分隔符；不传则按 infoMode 决定（icon 模式不加分隔符） */
  separator?: string | null;
}) {
  if (fields.length === 0) return null;
  const sep = separator === undefined ? (mode === 'icon' ? null : '·') : separator;
  const nodes: ReactNode[] = [];
  fields.forEach((f, i) => {
    if (i > 0 && sep) {
      nodes.push(
        <span
          key={`sep-${f.key}`}
          style={{
            color: sep === '|' ? '#999999' : '#cbd5e1',
            margin: `0 ${tokens.fs * 0.72}px`,
          }}
        >
          {sep}
        </span>,
      );
    }
    nodes.push(
      <span
        key={f.key}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          // 有分隔符时由分隔符本身撑开间距；图标模式（无分隔符）靠右外边距把相邻字段分开
          marginRight: sep ? tokens.fs * 0.25 : tokens.fs * 1.15,
        }}
      >
        <FieldView field={f} mode={mode} tokens={tokens} />
      </span>,
    );
  });
  return <>{nodes}</>;
}

/** 单行信息容器：不使用 flex gap（html2canvas 兼容性），用 lineHeight 兜住换行行距 */
function lineStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', alignItems: 'center', lineHeight: 1.9 };
}

export function HeaderBlock({ resume, tokens }: { resume: Resume; tokens: RenderTokens }) {
  const { basic, style } = resume;
  // 只要上传了头像就展示（此前误用模板的 showAvatar 开关，导致大多数模板上传后不显示）
  const showAvatar = !!basic.avatar;
  const info = buildInfoFields(basic);
  const contacts = buildContactFields(basic);
  const mode = style.infoMode;

  // 尺寸对齐线上导出：姓名 24pt(=32px@fs14)，头像 66×81pt(=88×108px) 圆角矩形
  const nameStyle: CSSProperties = {
    fontSize: tokens.fs * 2.28,
    fontWeight: 700,
    lineHeight: 1.15,
    color: '#000000',
    letterSpacing: 0.5,
  };

  const AVATAR_W = 88; // 4:5 竖版（88 × 110，精确等于 4:5；高度贴近参考 PDF 的 108px）
  const AVATAR_H = 110;

  const avatarNode = showAvatar ? (
    <img
      src={basic.avatar}
      alt=""
      style={{
        width: AVATAR_W,
        height: AVATAR_H,
        borderRadius: 6,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
      }}
    />
  ) : null;

  /** 头部与第一个章节之间的分隔线（对齐线上导出：全内容宽、#e5e7eb）
      头部完全没有文字时（新简历尚未填写）不画，否则会变成一条突兀的孤立横线 */
  const dividerNode =
    basic.name || info.length > 0 || contacts.length > 0 ? (
      <div style={{ marginTop: tokens.fs * 0.9, height: 1, background: '#e5e7eb' }} />
    ) : null;

  // 平铺布局：姓名（头像右侧） + 所有字段在一行内用竖向分隔线平铺
  if (style.layout === 'tile') {
    const all = [...contacts, ...info];
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: tokens.fs * 0.7,
          }}
        >
          <div style={nameStyle}>{basic.name}</div>
          {avatarNode}
        </div>
        <div style={lineStyle()}>
          {all.map((f, i) => (
            <Fragment key={f.key}>
              {i > 0 && (
                <span
                  style={{
                    width: 1,
                    height: tokens.fs * 0.95,
                    background: '#e5e7eb',
                    margin: `0 ${tokens.fs * 0.7}px`,
                  }}
                />
              )}
              <FieldView field={f} mode={mode} tokens={tokens} />
            </Fragment>
          ))}
        </div>
        {dividerNode}
      </div>
    );
  }

  // 居中布局：姓名居中、头像右上角（对齐线上导出：电话|邮箱一行 → 性别/年限/意向/政治面貌一行）
  if (style.layout === 'center') {
    return (
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          // 头像绝对定位不占高度，用 minHeight 保证下方分隔线落在头像底部
          minHeight: avatarNode ? AVATAR_H : undefined,
        }}
      >
        {avatarNode && <div style={{ position: 'absolute', right: 0, top: 0 }}>{avatarNode}</div>}
        <div style={nameStyle}>{basic.name}</div>
        {contacts.length > 0 && (
          <div style={{ ...lineStyle(), justifyContent: 'center', marginTop: tokens.fs * 0.62 }}>
            <InfoLine fields={contacts} mode={mode} tokens={tokens} separator="|" />
          </div>
        )}
        {info.length > 0 && (
          <div style={{ ...lineStyle(), justifyContent: 'center', marginTop: tokens.fs * 0.42 }}>
            <InfoLine fields={info} mode={mode} tokens={tokens} />
          </div>
        )}
        {dividerNode}
      </div>
    );
  }

  // 居左布局：姓名左对齐，头像右侧
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={nameStyle}>{basic.name}</div>
          {contacts.length > 0 && (
            <div style={{ ...lineStyle(), marginTop: tokens.fs * 0.62 }}>
              <InfoLine fields={contacts} mode={mode} tokens={tokens} separator="|" />
            </div>
          )}
          {info.length > 0 && (
            <div style={{ ...lineStyle(), marginTop: tokens.fs * 0.42 }}>
              <InfoLine fields={info} mode={mode} tokens={tokens} />
            </div>
          )}
        </div>
        {avatarNode && <div style={{ marginLeft: 16 }}>{avatarNode}</div>}
      </div>
      {dividerNode}
    </div>
  );
}

/* ----------------------------- 章节标题 ----------------------------- */

function SectionHeading({
  title,
  tokens,
  icon,
}: {
  title: string;
  tokens: RenderTokens;
  /** 「图标线条」版式标题左侧的图标（由模块类型决定） */
  icon?: LucideIcon;
}) {
  // 对齐线上导出：章节标题 12pt(=16px@fs14)、粗体
  const size = tokens.fs * 1.14;
  const base: CSSProperties = { fontSize: size, fontWeight: 700, lineHeight: 1.25 };

  switch (tokens.heading) {
    case 'label':
      return (
        <div style={{ marginBottom: tokens.fs * 0.42 }}>
          <span
            style={{
              ...base,
              display: 'inline-block',
              background: tokens.primary,
              color: '#ffffff',
              padding: `${tokens.fs * 0.36}px ${tokens.fs * 0.72}px`,
              borderRadius: 3,
            }}
          >
            {title}
          </span>
        </div>
      );
    case 'bar':
      return (
        <div
          style={{
            ...base,
            display: 'flex',
            alignItems: 'center',
            color: tokens.primary,
            marginBottom: tokens.fs * 0.5,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: tokens.fs * 0.28,
              height: size * 1.05,
              background: tokens.primary,
              borderRadius: 2,
              marginRight: tokens.fs * 0.5,
            }}
          />
          <span>{title}</span>
        </div>
      );
    case 'rule':
      return (
        <div
          style={{
            ...base,
            color: tokens.primary,
            borderBottom: `2px solid ${tokens.primary}`,
            paddingBottom: tokens.fs * 0.15,
            marginBottom: tokens.fs * 0.55,
          }}
        >
          {title}
        </div>
      );
    case 'iconline':
      return (
        <div style={{ marginBottom: tokens.fs * 0.55 }}>
          <div
            style={{
              ...base,
              display: 'flex',
              alignItems: 'center',
              gap: tokens.fs * 0.45,
              color: '#000000',
            }}
          >
            {icon && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: size * 1.2,
                  height: size * 1.2,
                  background: tokens.primary,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              >
                {(() => {
                  const Ico = icon;
                  return <Ico size={size * 0.62} color="#ffffff" strokeWidth={2.2} />;
                })()}
              </span>
            )}
            <span>{title}</span>
          </div>
          {/* 整宽主题色横线 */}
          <div
            style={{
              height: Math.max(1.5, tokens.fs * 0.11),
              background: tokens.primary,
              marginTop: tokens.fs * 0.32,
              borderRadius: 1,
            }}
          />
        </div>
      );
    case 'skew':
      // 对照参考稿：主题色平行四边形色块 + 白色粗体标题。
      // skewX(+12°)：底边右移、顶边左移（左边缘呈「\」形，与参考稿一致）；内层反向 skew 让文字保持直立。
      return (
        <div style={{ marginBottom: tokens.fs * 0.5 }}>
          <span
            style={{
              display: 'inline-block',
              background: tokens.primary,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: size,
              lineHeight: 1,
              padding: `${tokens.fs * 0.22}px ${tokens.fs * 0.6}px`,
              transform: 'skewX(12deg)',
              transformOrigin: 'bottom left',
              marginLeft: tokens.fs * 0.18,
              borderRadius: 1,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: 'skewX(-12deg)',
              }}
            >
              {title}
            </span>
          </span>
        </div>
      );
    case 'plain':
    default:
      return (
        <div
          style={{
            ...base,
            color: '#000000',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: tokens.fs * 0.15,
            marginBottom: tokens.fs * 0.55,
          }}
        >
          {title}
        </div>
      );
  }
}

/* ----------------------------- 条目渲染 ----------------------------- */

/**
 * 条目行：三栏布局（对齐线上导出）
 *   左：名称（粗体，左对齐）  中：专业（学历）/ 职位（页面居中）  右：时间区间（右对齐）
 * 中栏用绝对定位居中于内容区正中（不是「剩余空间」居中）。
 */
/** 条目行的「首行」：名称（左）/ 角色或专业（页面居中）/ 时间（右） */
function ItemHeader({
  item,
  tokens,
  language,
  type,
}: {
  item: ResumeItem;
  tokens: RenderTokens;
  language: Resume['style']['language'];
  type?: ResumeSection['type'];
}) {
  const range = formatRange(item.startDate, item.endDate, item.current, language);
  // 教育背景：专业（学历）；其余模块：职位/角色
  const isEducation = type === 'education';
  const suffix = item.label && item.labelValue ? `（${item.labelValue}）` : '';

  return (
    /*
      三栏：左=名称（可换行，绝不截断）、中=专业/职位（绝对定位居中于内容区正中）、右=时间。
      中栏用绝对定位而非三栏 flex，是为了保证无论左右两侧宽度如何，中栏都精确落在页面中线上
      （与线上导出一致：中间列的中心 == 页面中心）。
    */
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          flex: '1 1 auto',
          maxWidth: '46%',
          fontWeight: 700,
          color: '#000000',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {item.name}
      </span>

      {(item.role || suffix) && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            color: '#000000',
            fontWeight: isEducation ? 400 : 700,
          }}
        >
          {item.role}
          {suffix && <span style={{ color: '#000000', fontWeight: 400 }}>{suffix}</span>}
        </span>
      )}

      {range && (
        <span style={{ flex: '0 0 auto', color: '#000000', whiteSpace: 'nowrap' }}>{range}</span>
      )}
    </div>
  );
}

function ItemRow({
  item,
  tokens,
  language,
  last,
  type,
}: {
  item: ResumeItem;
  tokens: RenderTokens;
  language: Resume['style']['language'];
  last: boolean;
  type?: ResumeSection['type'];
}) {
  const range = formatRange(item.startDate, item.endDate, item.current, language);
  const hasContent = plainText(item.content).length > 0;

  return (
    <div style={{ marginBottom: last ? 0 : tokens.fs * 0.62 }}>
      <ItemHeader item={item} tokens={tokens} language={language} type={type} />
      {hasContent && (
        <div
          className="resume-rich"
          style={{ marginTop: tokens.fs * 0.2, lineHeight: tokens.lineHeight, color: '#000000' }}
          dangerouslySetInnerHTML={{ __html: normalizeRichHtml(item.content) }}
        />
      )}
    </div>
  );
}

/** 获奖：多条且均只有名称时，用菱形 ◆ 排成两列紧凑列表 */
function AwardList({ section, tokens }: { section: ResumeSection; tokens: RenderTokens }) {
  const row = (it: ResumeItem) => {
    const date = it.labelValue.trim();
    return (
      <div key={it.id} style={{ display: 'flex', alignItems: 'baseline', marginBottom: tokens.fs * 0.4 }}>
        <span style={{ color: tokens.primary, flexShrink: 0, fontSize: tokens.fs * 0.8 }}>◆</span>
        <span style={{ flex: 1, minWidth: 0, color: '#000000', marginLeft: tokens.fs * 0.35 }}>{it.name}</span>
        {date && <span style={{ color: '#9ca3af', flexShrink: 0, whiteSpace: 'nowrap', marginLeft: tokens.fs * 0.5 }}>{date}</span>}
      </div>
    );
  };

  // 列数：条目多时排三列更紧凑（≥6 条三列，否则两列）；按列轮流分配（行优先）
  const colCount = section.items.length >= 6 ? 3 : 2;
  const cols: ResumeItem[][] = Array.from({ length: colCount }, () => []);
  section.items.forEach((it, i) => cols[i % colCount].push(it));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {cols.map((col, ci) => (
        <div
          key={ci}
          style={{ flex: 1, minWidth: 0, marginRight: ci < colCount - 1 ? tokens.fs * 1.2 : 0 }}
        >
          {col.map(row)}
        </div>
      ))}
    </div>
  );
}

function isAwardCompact(section: ResumeSection): boolean {
  return (
    section.type === 'award' &&
    section.items.length > 1 &&
    section.items.every((it) => plainText(it.content).length === 0)
  );
}

/** 块级标签集合：只有它们才开启新的分页片段；其余节点（文本、strong/em/span/a/br…）都是行内内容 */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION',
  'HR', 'ADDRESS', 'MAIN', 'ASIDE', 'NAV', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY',
]);

/** 行内文本序列化回 HTML：转义 & < >（否则 "a<b" 会被当成标签解析，吞掉后面的文字） */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 把一组「行内节点」拼回 HTML（保留节点顺序与原空白——空白本身就是词间距） */
function inlineRunHtml(nodes: Node[]): string {
  return nodes
    .map((n) => (n.nodeType === 1 ? (n as Element).outerHTML : escapeText(n.textContent || '')))
    .join('');
}

/** 是否为行内级节点（文本节点 / 非块级元素） */
function isInlineNode(n: Node): boolean {
  if (n.nodeType === 3) return true;
  if (n.nodeType !== 1) return false;
  return !BLOCK_TAGS.has((n as Element).tagName.toUpperCase());
}

/** 是否 <br> 元素 */
function isBrNode(n: Node): boolean {
  return n.nodeType === 1 && (n as Element).tagName.toUpperCase() === 'BR';
}

/**
 * 把富文本 HTML 拆成多个可分页的片段：
 * - **连续的「行内节点」归为同一片段**（关键：`文本 + <strong>文本</strong> + 文本` 必须仍是同一段，
 *   否则一段连续的文字会被拆成多行——加粗、斜体、中文输入法上屏、粘贴等任何产生节点边界的
 *   操作都会让预览凭空换行）；
 * - 顶层块级节点（`<p>` / `<ul>` / `<ol>` …）各自成片段；
 * - 顶层列表进一步按 `<li>` 拆（每个 `<li>` 单独成片段）；
 * - 含 `<br>` 的片段按行拆成原子块（每行本来就是换行，视觉不变，但分页能逐行填充）；
 * - 下标 0 / 末尾片段保留列表原本的上下外边距、中间片段置 0，
 *   使拆分后的总高度与拆分前**完全一致**。
 *
 * 返回 `{ html, pad }`：`pad` 表示该片段需要补回段落下外边距
 * （`.resume-rich:last-child p:last-child` 会把每个片段末尾段落的 margin 清零）。
 *
 * 只返回 ≥2 个片段时才拆分；解析不可用（SSR/Node 无 DOMParser）或只有单个片段时
 * 返回空数组，调用方回退为整块渲染，保证行为不变。
 */
function splitRichHtml(html: string): { html: string; pad: boolean }[] {
  if (typeof DOMParser === 'undefined') return [];
  const src = normalizeRichHtml(html || '').trim();
  if (!src) return [];

  let body: HTMLElement;
  try {
    body = new DOMParser().parseFromString(src, 'text/html').body;
  } catch {
    return [];
  }

  // 顶层节点（忽略纯空白文本节点）
  const nodes = Array.from(body.childNodes).filter((n) => {
    if (n.nodeType === 3) return !!(n.textContent || '').trim();
    if (n.nodeType === 1) return !!(n.textContent || '').trim() || (n as Element).children.length > 0;
    return false;
  });
  if (nodes.length === 0) return [];

  // 分组：连续行内节点 → 一个「行内组」；块级元素 → 各自一组
  const groups: { el?: Element; nodes?: Node[] }[] = [];
  let run: Node[] = [];
  const flushRun = () => {
    if (run.length) {
      groups.push({ nodes: run });
      run = [];
    }
  };
  nodes.forEach((n) => {
    if (isInlineNode(n)) {
      run.push(n);
    } else {
      flushRun();
      groups.push({ el: n as Element });
    }
  });
  flushRun();

  const parts: { html: string; pad: boolean }[] = [];

  groups.forEach((group, gi) => {
    const isFirstGroup = gi === 0;
    const isLastGroup = gi === groups.length - 1;

    // ---- 行内组：整组是「同一段」，按 <br> 拆行（无 <br> 时就是一个片段） ----
    if (group.nodes) {
      const lineNodes: Node[][] = [];
      let acc: Node[] = [];
      group.nodes.forEach((n) => {
        if (isBrNode(n)) {
          lineNodes.push(acc);
          acc = [];
          return;
        }
        acc.push(n);
      });
      lineNodes.push(acc);

      const hasText = (ns: Node[]) => ns.some((n) => (n.textContent || '').trim());
      const visibleLines = lineNodes.filter(hasText);
      if (lineNodes.length > 1 && visibleLines.length > 1) {
        // 多行（含 <br>）：逐行成片段，让分页能把页底填满
        lineNodes.forEach((ns) => {
          if (!hasText(ns)) return; // 跳过空行（连续 <br>）
          parts.push({ html: inlineRunHtml(ns), pad: false });
        });
        return;
      }
      parts.push({ html: inlineRunHtml(group.nodes), pad: false });
      return;
    }

    const el = group.el as Element;
    const tag = el.tagName.toLowerCase();

    if ((tag === 'ul' || tag === 'ol') && el.children.length > 1) {
      const lis = Array.from(el.children);
      const start = tag === 'ol' ? Number(el.getAttribute('start') || 1) : 0;
      lis.forEach((li, k) => {
        const firstLi = k === 0;
        const lastLi = k === lis.length - 1;
        // 上外边距只在「列表本身是首个顶层节点」时保留 —— 否则它与前一节点的下外边距
        // 在原始文档里会折叠（浏览器取较大值），拆开后却会叠加。
        const top = firstLi && isFirstGroup ? '0.15em' : '0';
        const bottom = lastLi ? '0.15em' : '0';
        // 相邻 <li> 的外边距原本折叠成 0.08em/处，拆成独立 ul 后需显式清零一侧
        const liMargin = firstLi && isFirstGroup ? '0.08em 0' : '0 0 0.08em';
        const clone = li.cloneNode(true) as HTMLElement;
        clone.setAttribute('style', `margin:${liMargin}`);
        // 有序列表拆开后每段都会从 1 重新编号，用 start 续号
        const startAttr = tag === 'ol' ? ` start="${start + k}"` : '';
        parts.push({
          html: `<${tag}${startAttr} style="margin:${top} 0 ${bottom}">${clone.outerHTML}</${tag}>`,
          pad: false,
        });
      });
      return;
    }

    // 含硬换行（<br>）的段落：按行拆成可独立分页的原子块，
    // 让「页底剩余空间」能被逐行填满（否则整段是一个不可拆的块，
    // 放不下就整段跳到下一页，上一页留下大片空白）。
    // 视觉上完全一致：每行仍是同一段落的一行，行距不变。
    if (tag === 'p' && el.querySelector('br')) {
      const styleAttr = el.getAttribute('style') || '';
      // 行级样式：除最后一行外，清掉段落下外边距，避免行距变大
      const lineStyle = (isLast: boolean) =>
        `${styleAttr ? `${styleAttr};` : ''}${isFirstGroup ? '' : 'margin-top:0;'}` +
        (isLast ? '' : 'margin-bottom:0;');

      const lines: string[] = [];
      let acc = '';
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType === 1 && (node as Element).tagName.toUpperCase() === 'BR') {
          lines.push(acc);
          acc = '';
          return;
        }
        acc += node.nodeType === 1 ? (node as Element).outerHTML : escapeText(node.textContent || '');
      });
      lines.push(acc);

      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      if (nonEmpty.length > 1) {
        lines.forEach((line, li) => {
          if (!line.trim()) return; // 跳过空行（连续 <br>）
          const isLastLine = li === lines.length - 1;
          parts.push({
            html: `<p style="${lineStyle(isLastLine)}">${line}</p>`,
            pad: isLastLine && !isLastGroup,
          });
        });
        return;
      }
    }

    // 其它块级节点：下外边距交给 CSS（与原来一致），上外边距一律清零，
    // 由「前一片段的下外边距」提供跨页间距。
    let partHtml = el.outerHTML;
    if (!isFirstGroup) {
      const clone = el.cloneNode(true) as HTMLElement;
      const prev = clone.getAttribute('style');
      clone.setAttribute('style', `${prev ? `${prev};` : ''}margin-top:0`);
      partHtml = clone.outerHTML;
    }
    // pad：末片段不补——原始文档里最后一段落的下外边距也被同一条 CSS 清掉了
    parts.push({ html: partHtml, pad: tag === 'p' && !isLastGroup });
  });

  return parts.length > 1 ? parts : [];
}

export function SectionBlock({
  section,
  tokens,
  language,
}: {
  section: ResumeSection;
  tokens: RenderTokens;
  language: Resume['style']['language'];
}) {
  let body: ReactNode;
  if (section.kind === 'rich') {
    body = (
      <div
        className="resume-rich"
        style={{ lineHeight: tokens.lineHeight, color: '#000000' }}
        dangerouslySetInnerHTML={{ __html: normalizeRichHtml(section.content) }}
      />
    );
  } else if (isAwardCompact(section)) {
    body = <AwardList section={section} tokens={tokens} />;
  } else {
    body = (
      <>
        {section.items.map((it, i) => (
          <ItemRow
            key={it.id}
            item={it}
            tokens={tokens}
            language={language}
            type={section.type}
            last={i === section.items.length - 1}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <SectionHeading title={section.title} tokens={tokens} icon={SECTION_ICONS[section.type]} />
      {body}
    </>
  );
}

/* ----------------------------- 组装 ----------------------------- */

/** 把简历拆成「头部块 + 各章节块」的原子块列表 */
export function buildBlocks(resume: Resume, tokens: RenderTokens): Block[] {
  const language = resume.style.language;
  const blocks: Block[] = [
    { key: 'header', node: <HeaderBlock resume={resume} tokens={tokens} />, gapBefore: 0 },
  ];

  for (const section of resume.sections) {
    if (!isSectionVisible(section)) continue;
    const gapBefore = tokens.sectionGap;

    // 富文本模块：按顶层节点 / 列表项拆成多个可分页片段，使长文本也能跨页
    //（标题与首个片段绑定，避免标题孤立在页底）
    if (section.kind === 'rich') {
      const parts = splitRichHtml(section.content);
      if (parts.length > 1) {
        parts.forEach((part, i) => {
          const first = i === 0;
          const last = i === parts.length - 1;
          blocks.push({
            key: first ? `sec-${section.id}` : `rich-${section.id}-${i}`,
            gapBefore: first ? gapBefore : 0,
            node: (
              <>
                {first && (
              <SectionHeading
                title={section.title}
                tokens={tokens}
                icon={SECTION_ICONS[section.type]}
              />
            )}
                <div
                  className="resume-rich"
                  style={{
                    lineHeight: tokens.lineHeight,
                    color: '#000000',
                    // 补回被 `.resume-rich:last-child p:last-child` 清掉的段落下外边距
                    paddingBottom: !last && part.pad ? tokens.fs * 0.25 : undefined,
                  }}
                  dangerouslySetInnerHTML={{ __html: part.html }}
                />
              </>
            ),
          });
        });
        continue;
      }
      blocks.push({
        key: `sec-${section.id}`,
        node: <SectionBlock section={section} tokens={tokens} language={language} />,
        gapBefore,
      });
      continue;
    }

    // 获奖紧凑列表不可再分，整块参与分页
    if (isAwardCompact(section)) {
      blocks.push({
        key: `sec-${section.id}`,
        node: <SectionBlock section={section} tokens={tokens} language={language} />,
        gapBefore,
      });
      continue;
    }

    // 条目式模块拆成「章节标题 + 第 1 条」「第 2 条」…多个原子块，使长模块可以跨页拆分
    // （标题与首条绑定，避免标题孤立在页底）。
    // 此前整块不可分 —— 一个长模块放不下就被整体推到下一页，上一页会大面积留白。
    section.items.forEach((item, i) => {
      const first = i === 0;
      const lastItem = i === section.items.length - 1;
      const heading = first ? (
        <SectionHeading title={section.title} tokens={tokens} icon={SECTION_ICONS[section.type]} />
      ) : null;
      const itemBlocks = first ? `sec-${section.id}` : `it-${item.id}`;
      const parts = splitRichHtml(item.content);

      // 单条描述本身过长时，进一步把描述拆成多个可分页片段
      //（否则「只有一条很长经历的模块」仍会整块换页 + 超出部分被裁掉）
      if (parts.length > 1) {
        parts.forEach((part, k) => {
          const firstPart = k === 0;
          const lastPart = k === parts.length - 1;
          const isFirstBlock = first && firstPart;
          blocks.push({
            key: isFirstBlock ? itemBlocks : `it-${item.id}-${k}`,
            gapBefore: isFirstBlock ? gapBefore : 0,
            node: (
              <>
                {isFirstBlock && heading}
                {/* 条目外边距只挂在最后一段上，其余片段为 0 */}
                <div
                  style={{ marginBottom: lastPart ? (lastItem ? 0 : tokens.fs * 0.62) : 0 }}
                >
                  {firstPart && (
                    <ItemHeader item={item} tokens={tokens} language={language} type={section.type} />
                  )}
                  <div
                    className="resume-rich"
                    style={{
                      marginTop: firstPart ? tokens.fs * 0.2 : undefined,
                      lineHeight: tokens.lineHeight,
                      color: '#000000',
                      paddingBottom: !lastPart && part.pad ? tokens.fs * 0.25 : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: part.html }}
                  />
                </div>
              </>
            ),
          });
        });
        return;
      }

      blocks.push({
        key: itemBlocks,
        gapBefore: first ? gapBefore : 0,
        node: (
          <>
            {heading}
            <ItemRow
              item={item}
              tokens={tokens}
              language={language}
              type={section.type}
              last={lastItem}
            />
          </>
        ),
      });
    });
  }

  return blocks;
}

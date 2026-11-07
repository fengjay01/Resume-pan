import { safeStorage } from '@/lib/storage';
import { useResumeStore } from '@/store/resumeStore';
import { SAMPLE_RESUME } from '@/data/sampleResume';
import { uid } from '@/lib/id';
import type { Resume, ResumeItem, ResumeSection, ResumeStyle } from '@/types/resume';

/**
 * 一次性迁移集合。
 *
 * 约定：没有简历时**不要**消耗一次性标记——等真正有数据的那次加载再迁移，
 * 否则空加载会把标记烧掉，之后有数据也不再迁移（这个坑踩过一次）。
 */

interface Migration {
  flag: string;
  /** 逐条迁移简历的 style；返回 null 表示无需改动 */
  apply?: (style: ResumeStyle) => ResumeStyle | null;
  /** 需要整份简历级别处理时使用（如内置示例的内容替换）；返回 null 表示无需改动 */
  applyResume?: (resume: Resume) => Resume | null;
}

/**
 * 把「手排获奖」迁移成结构化获奖条目。
 *
 * 背景：不少用户在富文本里用 `🔹获奖名 + 一串 &nbsp;` 手工对齐出多列布局 ——
 * 这种排版**完全依赖换行点**，屏幕/打印两种排版管线的字宽有引擎级微差
 * （emoji 回退字体甚至不同），导出必然错位。迁移成 name-only 的结构化
 * 获奖条目后，渲染器用固定列宽的 flex 排列，任何管线都稳定一致。
 */
function compactAwards(resume: Resume): Resume | null {
  let changed = false;
  const sections: ResumeSection[] = resume.sections.map((section) => {
    if (section.type !== 'award') return section;
    // 内容可能写在 section.content 或唯一 item 的 content 里
    const richSources = [
      section.content || '',
      ...section.items.map((it) => (it.name ? '' : it.content || '')),
    ];
    const html = richSources.find((s) => s.includes('🔹'));
    if (!html) return section;
    const names: string[] = [];
    const re = /🔹([\s\S]*?)(?=🔹|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const name = m[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;|&amp;nbsp;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (name) names.push(name);
    }
    // 只有能解出 ≥2 条、且每条不含残留标签时才迁移（避免误伤正常富文本）
    if (names.length < 2 || names.some((n) => /[<>]/.test(n))) return section;
    changed = true;
    const items: ResumeItem[] = names.map((name) => ({
      id: uid('it'),
      name,
      role: '',
      label: '',
      labelValue: '',
      startDate: '',
      endDate: '',
      current: false,
      content: '',
    }));
    return { ...section, kind: 'list', items, content: '' };
  });
  return changed ? { ...resume, sections, updatedAt: Date.now() } : null;
}

const MIGRATIONS: Migration[] = [
  {
    // 手排获奖（🔹 + &nbsp; 对齐）→ 结构化条目，三种导出模式的排版才能一致
    flag: 'xl-migrate-award-compact-v1',
    applyResume: (resume) => compactAwards(resume),
  },
  {
    // 早期模板默认「居左」布局，用户希望头部信息居中
    flag: 'xl-migrate-layout-center-v1',
    apply: (style) => (style.layout === 'center' ? null : { ...style, layout: 'center' }),
  },
  {
    // 早期默认「文字」模式（会写出「性别：」这类标签），用户希望改为「小图标 + 值」
    flag: 'xl-migrate-info-icon-v1',
    apply: (style) => (style.infoMode === 'icon' ? null : { ...style, infoMode: 'icon' }),
  },
  {
    // 旧内置示例简历带真实感的个人信息（电话 / 邮箱 / 学校），统一替换为 XX 占位版。
    // 仅当示例仍是「未编辑过的原版」（电话特征值未变）时才替换，避免覆盖用户的修改。
    flag: 'xl-migrate-sample-placeholder-v1',
    applyResume: (resume) => {
      if (resume.id !== 'sample-resume') return null;
      if (resume.basic.phone !== '17638437151') return null;
      return { ...SAMPLE_RESUME, createdAt: resume.createdAt, updatedAt: Date.now() };
    },
  },
];

export function runMigrationsOnce(): void {
  const { resumes, update } = useResumeStore.getState();
  if (!resumes.length) return;

  MIGRATIONS.forEach(({ flag, apply, applyResume }) => {
    if (safeStorage.getItem(flag)) return;
    safeStorage.setItem(flag, '1');
    resumes.forEach((r) => {
      if (applyResume) {
        const next = applyResume(r);
        if (next) update(r.id, () => next);
        return;
      }
      if (!apply) return;
      const next = apply(r.style);
      if (next) update(r.id, (resume) => ({ ...resume, style: next }));
    });
  });
}

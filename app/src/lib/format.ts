/** 时间戳 → YYYY/M/D */
export function formatDateCn(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** YYYY-MM → YYYY.MM */
export function formatMonth(v: string): string {
  if (!v) return '';
  return v.replace('-', '.');
}

/**
 * 生成简历中的时间区间文案。
 * 如 2023-07 ~ 至今 / 2020.09-2024.06
 */
export function formatRange(
  start?: string,
  end?: string,
  current?: boolean,
  lang: 'zh' | 'en' = 'zh',
): string {
  const s = formatMonth(start || '');
  const e = current ? (lang === 'en' ? 'Present' : '至今') : formatMonth(end || '');
  if (!s && !e) return '';
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

/** 由出生日期计算年龄 */
export function calcAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** 截断文本 */
export function truncate(text: string, len = 40): string {
  if (!text) return '';
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

/** 时间戳 → 相对时间（刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026/3/1） */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatDateCn(ts);
}

/** 回收站剩余保留天数（不足 1 天按 1 天计，已过期返回 0） */
export function trashDaysLeft(deletedAt: number, retentionMs: number, now = Date.now()): number {
  const left = retentionMs - (now - deletedAt);
  if (left <= 0) return 0;
  return Math.ceil(left / 86_400_000);
}

/**
 * 数据备份 / 恢复：把 localStorage 里的简历数据（与本地账户身份）导出为 JSON 文件，
 * 或从 JSON 文件恢复。纯前端实现，不经过任何服务器。
 */
import { safeStorage } from './storage';

const DATA_KEY = 'xl-resume-data';
const AUTH_KEY = 'xl-resume-auth';

export interface BackupFile {
  app: 'resume-pan' | 'xiaolin-resume';
  version: 1;
  exportedAt: string;
  /** xl-resume-data 的原始 JSON（zustand persist 格式：{ state: { resumes }, version }） */
  data: unknown;
  /** xl-resume-auth 的原始 JSON（可选，旧备份可能没有） */
  auth?: unknown;
}

export interface ParsedBackup {
  file: BackupFile;
  /** 备份里的简历份数 */
  resumes: number;
}

/** 当前已保存的简历份数（读原始持久化数据，避免依赖 store） */
export function countLocalResumes(): number {
  const raw = safeStorage.getItem(DATA_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { state?: { resumes?: unknown } };
    const list = parsed?.state?.resumes;
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

/** 组装备份对象（data 必须是解析后的对象，否则恢复时会写坏 localStorage） */
export function buildBackup(): BackupFile {
  const raw = safeStorage.getItem(DATA_KEY);
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const rawAuth = safeStorage.getItem(AUTH_KEY);
  let auth: unknown;
  try {
    auth = rawAuth ? JSON.parse(rawAuth) : undefined;
  } catch {
    auth = undefined;
  }
  return {
    app: 'resume-pan',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
    auth,
  };
}

/** 导出备份：触发浏览器下载 JSON 文件 */
export function downloadBackup(): void {
  const file = buildBackup();
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `Resume-Pan-备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * 解析并校验备份文件内容。
 * 校验失败返回 `{ ok: false, error }`，调用方负责提示。
 */
export function parseBackup(text: string): { ok: true; resumes: number; file: BackupFile } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是有效的 JSON' };
  }
  const file = obj as Partial<BackupFile> | null;
  if (!file || typeof file !== 'object') {
    return { ok: false, error: '文件内容为空' };
  }
  // 兼容旧版导出的备份文件（品牌更名前的标识）
  if (file.app !== 'resume-pan' && file.app !== 'xiaolin-resume') {
    return { ok: false, error: '这不是本应用导出的备份文件' };
  }

  // data 允许是对象（正常导出）或字符串（历史格式），统一成对象
  let data: unknown = file.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { ok: false, error: '备份里的简历数据损坏' };
    }
  }
  const state = (data as { state?: { resumes?: unknown } } | null)?.state;
  if (!state || !Array.isArray(state.resumes)) {
    return { ok: false, error: '备份文件里没有简历数据（缺少 resumes）' };
  }
  return { ok: true, resumes: state.resumes.length, file: { ...(file as BackupFile), data } };
}

/**
 * 把备份写回 localStorage。写入后需要**刷新页面**让 zustand 重新水合。
 */
export function applyBackup(file: BackupFile): void {
  safeStorage.setItem(DATA_KEY, JSON.stringify(file.data));
  if (file.auth !== undefined && file.auth !== null) {
    safeStorage.setItem(AUTH_KEY, JSON.stringify(file.auth));
  }
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { applyStyleOnly, applyTemplate, cloneResume, createResume } from '@/lib/resume';
import { safeStorage } from '@/lib/storage';
import { TRASH_RETENTION_MS, type Resume, type SaveStatus, type TrashedResume } from '@/types/resume';

interface ResumeState {
  resumes: Resume[];
  /** 回收站：删除的简历先放这里，30 天内可恢复，到期自动彻底删除 */
  trashed: TrashedResume[];
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  /** localStorage 水合是否完成 */
  hydrated: boolean;

  create: (templateId: string, name?: string) => Resume;
  /** 直接加入一份完整简历（导入简历用），放在最前面 */
  add: (resume: Resume) => void;
  get: (id: string) => Resume | undefined;
  /** 局部更新简历（自动刷新 updatedAt） */
  patch: (id: string, patch: Partial<Resume>) => void;
  /** 用回调式更新，便于深改 sections/basic/style */
  update: (id: string, updater: (resume: Resume) => Resume) => void;
  duplicate: (id: string) => Resume | undefined;
  rename: (id: string, name: string) => void;
  /** 删除 = 移入回收站（软删除，可在 30 天内恢复） */
  remove: (id: string) => void;
  /** 批量移入回收站（软删除，一次持久化写入） */
  removeMany: (ids: string[]) => void;
  /** 彻底删除（跳过回收站，不可恢复） */
  purgeNow: (id: string) => void;
  /** 批量彻底删除（跳过回收站，不可恢复，一次持久化写入） */
  purgeMany: (ids: string[]) => void;
  /** 从回收站恢复到列表（尽量放回删除前的位置） */
  restore: (id: string) => void;
  /** 彻底删除单条（不可恢复） */
  purge: (id: string) => void;
  /** 清空回收站 */
  emptyTrash: () => void;
  /** 清理超过保留期的回收站条目（自动执行） */
  purgeExpired: () => void;
  /** 自定义排序：把第 from 份简历移到第 to 个位置（顺序持久化到 localStorage） */
  reorder: (from: number, to: number) => void;
  /** 按 id 列表整体设定顺序（拖拽实时重排后一次性提交） */
  setOrder: (ids: string[]) => void;
  /** 一次性提交顺序 + 置顶状态（拖拽时跨区拖动会改变置顶） */
  setOrderWithPins: (ids: string[], pinnedIds: string[]) => void;
  /** 切换某份简历的置顶状态（置顶数量不限） */
  togglePin: (id: string) => void;
  switchTemplate: (id: string, templateId: string) => void;
  /** 只换风格（主题色/布局/信息展示），不打乱模块顺序 */
  switchStyle: (id: string, templateId: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
}

export const useResumeStore = create<ResumeState>()(
  persist(
    (set, get) => ({
      resumes: [],
      trashed: [],
      saveStatus: 'saved',
      lastSavedAt: null,
      hydrated: false,

      create: (templateId, name) => {
        const resume = createResume(templateId, name);
        set((s) => ({ resumes: [resume, ...s.resumes] }));
        return resume;
      },

      add: (resume) =>
        set((s) => ({ resumes: [resume, ...s.resumes], lastSavedAt: Date.now() })),

      get: (id) => get().resumes.find((r) => r.id === id),

      patch: (id, patch) =>
        set((s) => ({
          resumes: s.resumes.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r,
          ),
          lastSavedAt: Date.now(),
        })),

      update: (id, updater) =>
        set((s) => ({
          resumes: s.resumes.map((r) =>
            r.id === id ? { ...updater(r), id, updatedAt: Date.now() } : r,
          ),
          lastSavedAt: Date.now(),
        })),

      duplicate: (id) => {
        const src = get().resumes.find((r) => r.id === id);
        if (!src) return undefined;
        const copy = cloneResume(src);
        set((s) => ({ resumes: [copy, ...s.resumes] }));
        return copy;
      },

      rename: (id, name) =>
        set((s) => ({
          resumes: s.resumes.map((r) =>
            r.id === id ? { ...r, name, updatedAt: Date.now() } : r,
          ),
          lastSavedAt: Date.now(),
        })),

      remove: (id) =>
        set((s) => {
          const index = s.resumes.findIndex((r) => r.id === id);
          if (index < 0) return {};
          const resume = s.resumes[index];
          return {
            resumes: s.resumes.filter((r) => r.id !== id),
            // 同一份简历不会被重复入站：以最新一次删除为准
            trashed: [
              { resume, deletedAt: Date.now(), index },
              ...s.trashed.filter((t) => t.resume.id !== id),
            ],
            lastSavedAt: Date.now(),
          };
        }),

      purgeNow: (id) =>
        set((s) => {
          const next = s.resumes.filter((r) => r.id !== id);
          return next.length === s.resumes.length ? {} : { resumes: next, lastSavedAt: Date.now() };
        }),

      removeMany: (ids) =>
        set((s) => {
          if (!ids.length) return {};
          const idSet = new Set(ids);
          const now = Date.now();
          const removing: TrashedResume[] = [];
          const kept: Resume[] = [];
          s.resumes.forEach((r, index) => {
            if (idSet.has(r.id)) removing.push({ resume: r, deletedAt: now, index });
            else kept.push(r);
          });
          // 没有命中任何一份（ids 已失效）时不做空写入
          if (!removing.length) return {};
          return {
            resumes: kept,
            // 同一份简历不会被重复入站：以最新一次删除为准
            trashed: [...removing, ...s.trashed.filter((t) => !idSet.has(t.resume.id))],
            lastSavedAt: now,
          };
        }),

      purgeMany: (ids) =>
        set((s) => {
          if (!ids.length) return {};
          const idSet = new Set(ids);
          const next = s.resumes.filter((r) => !idSet.has(r.id));
          if (next.length === s.resumes.length) return {};
          return { resumes: next, lastSavedAt: Date.now() };
        }),

      restore: (id) =>
        set((s) => {
          const entry = s.trashed.find((t) => t.resume.id === id);
          if (!entry) return {};
          const next = [...s.resumes];
          // 放回删除前的位置（列表已变短/变长时按边界收敛）
          const at = Math.max(0, Math.min(entry.index ?? 0, next.length));
          next.splice(at, 0, entry.resume);
          return {
            resumes: next,
            trashed: s.trashed.filter((t) => t.resume.id !== id),
            lastSavedAt: Date.now(),
          };
        }),

      purge: (id) =>
        set((s) => {
          const next = s.trashed.filter((t) => t.resume.id !== id);
          return next.length === s.trashed.length ? {} : { trashed: next };
        }),

      emptyTrash: () => set({ trashed: [], lastSavedAt: Date.now() }),

      purgeExpired: () =>
        set((s) => {
          const now = Date.now();
          const alive = s.trashed.filter((t) => now - t.deletedAt < TRASH_RETENTION_MS);
          // 没有过期项时返回空对象，避免无意义的重渲染
          return alive.length === s.trashed.length ? {} : { trashed: alive };
        }),

      reorder: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.resumes.length || to >= s.resumes.length)
            return {};
          const next = [...s.resumes];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { resumes: next };
        }),

      setOrder: (ids) =>
        set((s) => {
          const map = new Map(s.resumes.map((r) => [r.id, r] as const));
          const next = ids.map((id) => map.get(id)).filter(Boolean) as Resume[];
          // 容错：不在 ids 里的（拖拽期间新增的）简历排在后面，绝不丢失
          const rest = s.resumes.filter((r) => !ids.includes(r.id));
          return { resumes: [...next, ...rest] };
        }),

      setOrderWithPins: (ids, pinnedIds) =>
        set((s) => {
          const pinned = new Set(pinnedIds);
          const map = new Map(s.resumes.map((r) => [r.id, r] as const));
          const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Resume[];
          // 容错：不在 ids 里的（拖拽期间新增的）简历排在后面，绝不丢失
          const rest = s.resumes.filter((r) => !ids.includes(r.id));
          const applied = [...ordered, ...rest].map((r) => {
            const want = pinned.has(r.id);
            if (!!r.pinned === want) return r;
            return want
              ? { ...r, pinned: true, pinnedAt: Date.now() }
              : { ...r, pinned: false, pinnedAt: undefined };
          });
          return { resumes: applied, lastSavedAt: Date.now() };
        }),

      togglePin: (id) =>
        set((s) => {
          const target = s.resumes.find((r) => r.id === id);
          if (!target) return {};
          if (target.pinned) {
            // 取消置顶：原位不动（它自然落到置顶区之后的第一位）
            return {
              resumes: s.resumes.map((r) =>
                r.id === id ? { ...r, pinned: false, pinnedAt: undefined } : r,
              ),
              lastSavedAt: Date.now(),
            };
          }
          // 置顶：直接挪到最前，保证「点了置顶就排第一」
          const rest = s.resumes.filter((r) => r.id !== id);
          return {
            resumes: [{ ...target, pinned: true, pinnedAt: Date.now() }, ...rest],
            lastSavedAt: Date.now(),
          };
        }),

      switchTemplate: (id, templateId) =>
        set((s) => ({
          resumes: s.resumes.map((r) =>
            r.id === id ? applyTemplate(r, templateId) : r,
          ),
          lastSavedAt: Date.now(),
        })),

      switchStyle: (id, templateId) =>
        set((s) => ({
          resumes: s.resumes.map((r) => (r.id === id ? applyStyleOnly(r, templateId) : r)),
          lastSavedAt: Date.now(),
        })),

      setSaveStatus: (status) => set({ saveStatus: status }),
    }),
    {
      name: 'xl-resume-data',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) =>
        ({ resumes: s.resumes, trashed: s.trashed }) as unknown as ResumeState,
      onRehydrateStorage: () => () => {
        queueMicrotask(() => {
          // 打开时先清掉超过 30 天的回收站条目（自动删除）
          useResumeStore.getState().purgeExpired();
          useResumeStore.setState({ hydrated: true });
        });
      },
    },
  ),
);

/** 编辑器用：把 resume 变更写入 store，并驱动「保存中→已保存」状态机 */
export function useSavingIndicator() {
  return useResumeStore((s) => ({ status: s.saveStatus, at: s.lastSavedAt }));
}

/**
 * dev 防线：store 模块被 Vite 热替换时，react-refresh 只会重执行引用它的
 * 组件，而**已订阅旧实例的组件不会迁移**——结果面板写入新 store、预览还
 * 订阅旧 store，出现「改了字体/间距没反应」的僵尸双实例（已实际踩坑）。
 * store 是全局单一数据源，热替换毫无意义，直接整页刷新最安全。
 * 生产构建无 import.meta.hot，不受影响。
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}

/**
 * dev 防线：store 模块被 Vite 热替换时，react-refresh 只会重执行引用它的
 * 组件，而**已订阅旧实例的组件不会迁移**——结果面板写入新 store、预览还
 * 订阅旧 store，出现「改了字体/间距没反应」的僵尸双实例（已实际踩坑）。
 * store 是全局单一数据源，热替换毫无意义，直接整页刷新最安全。
 * 生产构建无 import.meta.hot，不受影响。
 */
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 编辑器多标签页：记录「在编辑器里打开过哪些简历」，方便多份简历间快速切换。
 *
 * 只存 id 列表（简历本体在 resumeStore 里，渲染时再查最新数据——
 * 浮层/标签绝不缓存实体对象，避免写操作后显示旧数据）。
 * localStorage 持久化：刷新 / 重启后标签还在。
 *
 * 入口收敛：EditorPage 挂载时把当前简历 open 进来（所有跳转入口自动覆盖，
 * 各页面无需各自调用）。
 */

/** 标签上限：超出后挤掉最早打开的（当前正在编辑的不会被挤掉，见 open 实现） */
export const EDITOR_TABS_MAX = 10;

interface EditorTabsState {
  /** 打开的简历 id，按打开顺序 */
  tabs: string[];
  /** 打开（已存在则不动，顺序保持稳定，与浏览器标签习惯一致） */
  open: (id: string) => void;
  /** 关闭 */
  close: (id: string) => void;
  /** 一键关闭全部 */
  closeAll: () => void;
  /** 拖拽排序：按给定顺序重排（不在 ids 里的标签保持原相对顺序追加在后） */
  reorder: (ids: string[]) => void;
}

export const useEditorTabsStore = create<EditorTabsState>()(
  persist(
    (set) => ({
      tabs: [],
      open: (id) =>
        set((s) => {
          if (s.tabs.includes(id)) return {};
          const next = [...s.tabs, id];
          if (next.length > EDITOR_TABS_MAX) next.splice(0, next.length - EDITOR_TABS_MAX);
          return { tabs: next };
        }),
      close: (id) => set((s) => (s.tabs.includes(id) ? { tabs: s.tabs.filter((t) => t !== id) } : {})),
      closeAll: () => set((s) => (s.tabs.length ? { tabs: [] } : {})),
      reorder: (ids) =>
        set((s) => {
          const wanted = new Set(ids);
          const next = [...ids, ...s.tabs.filter((t) => !wanted.has(t))];
          const same = next.length === s.tabs.length && next.every((t, i) => s.tabs[i] === t);
          return same ? {} : { tabs: next };
        }),
    }),
    {
      name: 'xl-editor-tabs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tabs: s.tabs }) as unknown as EditorTabsState,
    },
  ),
);

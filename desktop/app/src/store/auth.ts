import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import type { User } from '@/types/resume';

/**
 * 本地化模式：不做真实登录。
 * 应用始终以「本地用户」身份运行，简历数据全部落在浏览器 localStorage，开箱即用。
 */
export const LOCAL_USER: User = {
  id: 'LOCAL0001',
  nickname: '本地用户',
  createdAt: 1759900000000,
};

interface AuthState {
  user: User | null;
  /** localStorage 水合是否完成 */
  hydrated: boolean;
  /** 兼容旧调用：本地模式下直接返回本地用户 */
  login: (nickname?: string) => User;
  /** 本地模式下「退出登录」= 恢复默认本地身份 */
  logout: () => void;
  updateNickname: (nickname: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: LOCAL_USER,
      hydrated: false,
      login: (nickname) => {
        const user: User = nickname ? { ...LOCAL_USER, nickname } : LOCAL_USER;
        set({ user });
        return user;
      },
      logout: () => set({ user: LOCAL_USER }),
      updateNickname: (nickname) =>
        set((s) => (s.user ? { user: { ...s.user, nickname } } : s)),
    }),
    {
      name: 'xl-resume-auth',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ user: s.user }) as unknown as AuthState,
      // 本地模式下 user 恒不为空：旧版本可能残留 user: null，这里统一回落到本地用户
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState> | undefined;
        return { ...current, ...p, user: p?.user ?? LOCAL_USER };
      },
      onRehydrateStorage: () => () => {
        // 用微任务兜底：同步存储下水合回调可能在 store 赋值前同步触发，
        // 直接引用 useAuthStore 会撞上 TDZ，推迟一个微任务即可安全。
        queueMicrotask(() => useAuthStore.setState({ hydrated: true }));
      },
    },
  ),
);

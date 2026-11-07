import type { ReactNode } from 'react';

/**
 * 本地化模式：不做登录拦截。
 * 我的简历 / 编辑器 / 账户中心 均可直接访问；保留该组件是为了不改动路由结构，
 * 后续若要接入真实登录，只需在这里恢复「未登录则跳转 /login」的判定即可。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

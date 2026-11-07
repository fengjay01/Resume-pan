import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplate } from '@/data/templates';
import { useAuthStore } from '@/store/auth';
import { useResumeStore } from '@/store/resumeStore';

/**
 * 「使用模板」统一入口：
 * - 已登录：按模板新建简历并跳转编辑器；
 * - 未登录：跳登录页，登录成功后自动用该模板创建。
 */
export function useUseTemplate() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return useCallback(
    (templateId: string, from = '/templates') => {
      if (user) {
        const created = useResumeStore.getState().create(templateId, getTemplate(templateId).name);
        navigate(`/editor/${created.id}`);
      } else {
        navigate('/login', { state: { from, templateId } });
      }
    },
    [navigate, user],
  );
}

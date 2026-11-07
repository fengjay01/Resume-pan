import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { runMigrationsOnce } from '@/lib/migrate';
import { useResumeStore } from '@/store/resumeStore';
import HomePage from '@/pages/HomePage';
import TemplatesPage from '@/pages/TemplatesPage';
import ResumesPage from '@/pages/ResumesPage';
import TrashPage from '@/pages/TrashPage';
import EditorPage from '@/pages/EditorPage';
import LoginPage from '@/pages/LoginPage';
import AccountPage from '@/pages/AccountPage';
import JobGuidePage from '@/pages/JobGuidePage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  const hydrated = useResumeStore((s) => s.hydrated);

  // 水合完成后执行一次性迁移（头部居中布局、信息展示改用小图标）
  useEffect(() => {
    if (hydrated) runMigrationsOnce();
  }, [hydrated]);

  return (
    <Routes>
      {/* 编辑器：独立全屏布局 */}
      <Route
        path="/editor/:id"
        element={
          <RequireAuth>
            <EditorPage />
          </RequireAuth>
        }
      />

      {/* 站点：带导航与页脚 */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route
          path="/resumes"
          element={
            <RequireAuth>
              <ResumesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/resumes/trash"
          element={
            <RequireAuth>
              <TrashPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="/job-guide" element={<JobGuidePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}

import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  FileText,
  LayoutGrid,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';
import { Dropdown, MenuItem } from '@/components/common/Misc';
import { Button } from '@/components/common/Button';
import { Logo } from './Logo';

interface NavEntry {
  label: string;
  to?: string;
  children?: { label: string; desc?: string }[];
}

const NAV: NavEntry[] = [
  { label: '首页', to: '/' },
  { label: '简历模板', to: '/templates' },
  { label: '我的简历', to: '/resumes' },
];

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-[500] border-b border-ink-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-6">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {NAV.map((entry) =>
            entry.children ? (
              <Dropdown
                key={entry.label}
                align="left"
                trigger={
                  <button className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900">
                    {entry.label}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                }
              >
                {entry.children.map((c) => (
                  <MenuItem key={c.label}>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.label}</span>
                      {c.desc && <span className="text-xs text-ink-400">{c.desc}</span>}
                    </div>
                  </MenuItem>
                ))}
              </Dropdown>
            ) : (
              <NavLink
                key={entry.label}
                to={entry.to!}
                end={entry.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'text-brand-700'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                  )
                }
              >
                {entry.label}
              </NavLink>
            ),
          )}
        </nav>

        {user ? (
          <Dropdown
            trigger={
              <button className="inline-flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-3 transition hover:border-ink-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {user.nickname.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[120px] truncate text-sm text-ink-700">{user.nickname}</span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
              </button>
            }
          >
            <MenuItem icon={<UserIcon className="h-4 w-4" />} onClick={() => navigate('/account')}>
              账户中心
            </MenuItem>
            <MenuItem
              icon={<FileText className="h-4 w-4" />}
              onClick={() => navigate('/resumes')}
            >
              我的简历
            </MenuItem>
            <MenuItem
              icon={<LayoutGrid className="h-4 w-4" />}
              onClick={() => navigate('/templates')}
            >
              使用教程
            </MenuItem>
            <div className="my-1 h-px bg-ink-100" />
            <div className="px-3.5 py-2 text-xs leading-relaxed text-ink-400">
              本地模式 · 数据仅保存在本机浏览器
            </div>
          </Dropdown>
        ) : (
          <Button size="sm" onClick={() => navigate('/login')}>
            登录
          </Button>
        )}
      </div>
    </header>
  );
}

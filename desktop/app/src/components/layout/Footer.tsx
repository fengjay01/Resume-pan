import { Link } from 'react-router-dom';
import { Logo } from './Logo';

const COLUMNS: { title: string; links: { label: string; to?: string }[] }[] = [
  {
    title: '产品',
    links: [
      { label: '简历模板', to: '/templates' },
      { label: '我的简历', to: '/resumes' },
    ],
  },
  {
    title: '支持',
    links: [{ label: '使用帮助' }, { label: '联系我们' }, { label: '问题反馈' }],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-12 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">
            做能拿 offer 的简历，别让烂简历耽误你找工作。
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold text-ink-900">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to ? (
                    <Link to={l.to} className="text-sm text-ink-500 transition hover:text-brand-600">
                      {l.label}
                    </Link>
                  ) : (
                    <span className="cursor-default text-sm text-ink-500 transition hover:text-brand-600">
                      {l.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-100 py-5 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Resume-Pan. All rights reserved.
      </div>
    </footer>
  );
}

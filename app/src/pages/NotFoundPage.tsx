import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col items-center px-6 py-28 text-center">
      <h1 className="text-5xl font-bold text-ink-900">404</h1>
      <p className="mt-3 text-ink-500">抱歉，你访问的页面不存在。</p>
      <Link to="/" className="mt-6">
        <Button>返回首页</Button>
      </Link>
    </div>
  );
}

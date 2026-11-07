import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, FileDown, LayoutTemplate, RefreshCw, ScanLine, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Logo } from '@/components/layout/Logo';
import { QrCode } from '@/components/site/QrCode';
import { getTemplate } from '@/data/templates';
import { useAuthStore } from '@/store/auth';
import { useResumeStore } from '@/store/resumeStore';

interface LoginLocationState {
  from?: string;
  templateId?: string;
}

const EXPIRE_SECONDS = 120;

const HIGHLIGHTS = [
  { icon: LayoutTemplate, text: '按种类精选的专业模板，一键套用' },
  { icon: Eye, text: '实时编辑，所见即所得' },
  { icon: FileDown, text: '一键导出高质量 PDF，完全免费' },
];

type Status = 'active' | 'scanned' | 'expired';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);

  const state = (location.state as LoginLocationState | null) ?? null;

  const [status, setStatus] = useState<Status>('active');
  const [seconds, setSeconds] = useState(EXPIRE_SECONDS);
  const [refreshing, setRefreshing] = useState(false);
  const [seed, setSeed] = useState(7);

  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  // 倒计时
  useEffect(() => {
    if (status !== 'active' || refreshing) return;
    const timer = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(timer);
          setStatus('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, refreshing, seed]);

  const progress = useMemo(() => seconds / EXPIRE_SECONDS, [seconds]);

  const finishLogin = () => {
    login('Resume-Pan 用户');
    if (state?.templateId) {
      const created = useResumeStore
        .getState()
        .create(state.templateId, getTemplate(state.templateId).name);
      navigate(`/editor/${created.id}`, { replace: true });
    } else {
      navigate(state?.from || '/resumes', { replace: true });
    }
  };

  const handleScan = () => {
    if (status !== 'active' || refreshing) return;
    setStatus('scanned');
    const t = window.setTimeout(finishLogin, 800);
    timers.current.push(t);
  };

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const t = window.setTimeout(() => {
      setSeconds(EXPIRE_SECONDS);
      setSeed((v) => v + 1);
      setStatus('active');
      setRefreshing(false);
    }, 700);
    timers.current.push(t);
  };

  return (
    <div className="mx-auto flex max-w-[1240px] items-center justify-center px-6 py-14">
      <div className="grid w-full max-w-[900px] overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-float md:grid-cols-2">
        {/* 品牌区 */}
        <div className="relative flex flex-col justify-between gap-10 bg-gradient-to-br from-brand-50 via-white to-brand-50 p-9">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background: 'radial-gradient(55% 45% at 20% 15%, rgba(37,99,235,0.14), transparent 65%)',
            }}
          />
          <div className="relative">
            <Logo />
            <h2 className="mt-8 text-2xl font-bold leading-snug tracking-tight text-ink-900">
              用专业模板，
              <br />
              做能拿 offer 的简历
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              登录后简历自动保存到云端，随时编辑、一键导出。
            </p>
          </div>
          <ul className="relative flex flex-col gap-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-sm text-ink-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-card">
                  <h.icon className="h-4.5 w-4.5" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>

        {/* 登录区 */}
        <div className="flex flex-col items-center px-9 py-10 text-center">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">微信扫码登录</h1>
          <p className="mt-2 text-sm text-ink-500">请使用微信扫码登录</p>

          <div className="relative mt-6 h-[188px] w-[188px] rounded-2xl border border-ink-100 bg-white p-3 shadow-card">
            <button
              type="button"
              onClick={handleScan}
              disabled={status !== 'active'}
              className="block h-full w-full cursor-pointer disabled:cursor-default"
              aria-label="扫描二维码"
            >
              <QrCode seed={seed} />
            </button>

            {(status === 'expired' || status === 'scanned') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 backdrop-blur-[1px]">
                {status === 'expired' ? (
                  <>
                    <span className="text-sm font-medium text-ink-700">二维码已过期</span>
                    <Button size="sm" variant="outline" onClick={handleRefresh} loading={refreshing}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      点击刷新
                    </Button>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <span className="text-sm font-medium text-ink-700">扫码成功，正在登录…</span>
                  </>
                )}
              </div>
            )}

            {refreshing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/95 backdrop-blur-[1px]">
                <RefreshCw className="h-6 w-6 animate-spin text-brand-600" />
                <span className="text-sm text-ink-500">正在刷新…</span>
              </div>
            )}
          </div>

          <div className="mt-4 text-[13px] text-ink-500">
            {status === 'active' ? (
              <>
                二维码有效期 <span className="font-semibold text-ink-700">{seconds}</span> 秒
              </>
            ) : status === 'expired' ? (
              '二维码已失效，请点击刷新'
            ) : (
              '正在跳转，请稍候…'
            )}
          </div>
          <div className="mt-1 h-1 w-[188px] overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <p className="mt-5 text-xs text-ink-400">关注公众号后自动完成登录</p>

          <Button variant="outline" className="mt-3" onClick={handleScan} disabled={status !== 'active'}>
            <ScanLine className="h-4 w-4" />
            模拟扫码成功
          </Button>

          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            登录即表示同意
            <span className="mx-0.5 cursor-pointer text-brand-600 hover:underline">《用户协议》</span>
            与
            <span className="mx-0.5 cursor-pointer text-brand-600 hover:underline">《隐私政策》</span>
          </p>
        </div>
      </div>
    </div>
  );
}

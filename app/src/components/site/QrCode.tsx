import { useMemo } from 'react';
import { cn } from '@/lib/cn';

const SIZE = 25;

/** 生成一个视觉上接近二维码的确定性矩阵（不含真实编码信息） */
function buildMatrix(seed: number): boolean[][] {
    const m: boolean[][] = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => false),
    );
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= SIZE - 8) || (r >= SIZE - 8 && c < 8);

  // 伪随机填充
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (inFinder(r, c)) continue;
      m[r][c] = next() > 0.52;
    }
  }

  // 定位角（三个 7x7 回字）
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[r0 + r][c0 + c] = edge || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, SIZE - 7);
  drawFinder(SIZE - 7, 0);

  // 定位时序线
  for (let i = 8; i < SIZE - 8; i += 1) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
  return m;
}

export function QrCode({ className, seed = 7 }: { className?: string; seed?: number }) {
  const matrix = useMemo(() => buildMatrix(seed), [seed]);
  const cell = 100 / SIZE;

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="微信登录二维码"
      shapeRendering="crispEdges"
    >
      <rect width="100" height="100" fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill="#111827"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

/**
 * 用 esbuild 打包并立即执行一个 .ts 入口（纯逻辑测试用，不依赖浏览器/dev server）。
 * 用法（在仓库根目录或 app/ 下均可）：
 *   node tools/run-ts.mjs tools/test-entry.ts
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

// 以本文件所在位置定位仓库，不依赖运行时的工作目录（从 app/ 里跑 npm test 也能用）
const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, '..');
const appDir = path.join(repoRoot, 'app');

const req = createRequire(path.join(appDir, 'package.json'));
const esbuild = req('esbuild');

const entryArg = process.argv[2];
if (!entryArg) {
  console.error('用法: node tools/run-ts.mjs <entry.ts>');
  process.exit(1);
}
// 入口路径兼容两种写法：相对当前目录、或相对仓库根目录
const entry =
  [path.resolve(entryArg), path.resolve(repoRoot, entryArg)].find((p) => existsSync(p)) ??
  path.resolve(entryArg);

// 产物必须落在 app 内，Node 才能解析到 react 等依赖
const outfile = path.join(
  appDir,
  'node_modules/.wb-tmp',
  'run-' + path.basename(entry).replace(/\.tsx?$/, '.cjs'),
);

await esbuild.build({
  entryPoints: [path.resolve(entry)],
  bundle: true,
  // 用 CJS 产物：react / lucide-react 内部都是 CJS，打包进 ESM 会触发 esbuild 的 __require 垫片报错
  format: 'cjs',
  platform: 'node',
  alias: { '@': path.join(appDir, 'src') },
  nodePaths: [path.join(appDir, 'node_modules')],
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile,
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);

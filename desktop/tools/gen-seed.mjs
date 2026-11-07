/**
 * 用 esbuild 打包 src/data/sampleResume.ts（纯数据，无 DOM 依赖），
 * 生成 injectable 的 localStorage 种子文件，用于无头浏览器验证编辑器。
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const appDir = path.resolve('app');
const tmpDir = path.resolve('tools/.tmp');
mkdirSync(tmpDir, { recursive: true });

// esbuild 安装在 app/node_modules 下，这里从 app 的解析根加载
const require = createRequire(path.join(appDir, 'package.json'));
const esbuild = require('esbuild');
const { build } = esbuild;

const outfile = path.join(tmpDir, 'sample.mjs');
await build({
  entryPoints: [path.join(appDir, 'src/data/sampleResume.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@': path.join(appDir, 'src') },
  outfile,
  logLevel: 'warning',
});

const mod = await import(`file://${outfile}`);
const resume = mod.SAMPLE_RESUME ?? mod.createSampleResume();

const seed = {
  'xl-resume-auth': {
    state: { user: { id: 'DEMO2026ABCD', nickname: '林哥OxDkpg', createdAt: 1759900000000 } },
    version: 0,
  },
  'xl-resume-data': {
    state: { resumes: [resume] },
    version: 0,
  },
};

const outJson = path.resolve('tools/seeds/seed-sample.json');
writeFileSync(outJson, JSON.stringify(seed, null, 1), 'utf8');
const back = JSON.parse(readFileSync(outJson, 'utf8'));
console.log('resume id   :', resume.id);
console.log('resume name :', resume.name);
console.log('sections    :', resume.sections.length);
console.log('seed written:', outJson, back['xl-resume-data'].state.resumes[0].sections.length, 'sections ok');

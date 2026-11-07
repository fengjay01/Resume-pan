/**
 * 生成测试种子：示例简历 + 2 个「自定义模块」（带内容）。
 * 用于验证「切换模板是否会丢失自定义模块」。
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSection } from '@/lib/resume';
import { SAMPLE_RESUME } from '@/data/sampleResume';
import type { Resume } from '@/types/resume';

const resume: Resume = JSON.parse(JSON.stringify(SAMPLE_RESUME));

const c1 = createSection('custom', '自定义模块1');
c1.content = '<ul><li>校园开源社区核心贡献者，累计提交 120+ PR。</li></ul>';
const c2 = createSection('custom', '自定义模块2');
c2.content = '<ul><li>英语 CET-6 580 分，可无障碍阅读英文技术文档。</li></ul>';
resume.sections.push(c1, c2);

const seed = {
  'xl-resume-auth': {
    state: { user: { id: 'LOCAL0001', nickname: '本地用户', createdAt: 1759900000000 } },
    version: 0,
  },
  'xl-resume-data': { state: { resumes: [resume] }, version: 0 },
};

const out = path.resolve('tools/seeds/seed-custom.json');
writeFileSync(out, JSON.stringify(seed, null, 1), 'utf8');

console.log('resume id      :', resume.id);
console.log('模块总数        :', resume.sections.length);
console.log('自定义模块      :', resume.sections.filter((s) => s.type === 'custom').length);
console.log('模块顺序        :', resume.sections.map((s) => s.title).join(' | '));
console.log('写入            :', out);

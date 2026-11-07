import {
  applyTemplate,
  createItem,
  createResume,
  createSection,
} from '@/lib/resume';
import { TEMPLATES } from '@/data/templates';

const r0 = createResume('tpl-01', '测试简历');
r0.basic.name = '张三';

// 填一份教育背景
const edu = r0.sections.find((s) => s.type === 'education')!;
edu.items.push({ ...createItem('education'), name: '某大学', role: '计算机' });

// 填专业技能（富文本）
const skills = r0.sections.find((s) => s.type === 'skills')!;
skills.content = '<p>熟悉 TypeScript</p>';

// 三个自定义模块（关键：type 都为 custom，旧实现会被吃掉）
const c1 = createSection('custom', '自定义模块1');
c1.content = '<p>C1</p>';
const c2 = createSection('custom', '自定义模块2');
c2.content = '<p>C2</p>';
const c3 = createSection('custom', '自定义模块3');
c3.content = '<p>C3</p>';
r0.sections.push(c1, c2, c3);

const beforeIds = r0.sections.map((s) => s.id);

// 1) 单次切换
const r1 = applyTemplate(r0, 'tpl-02');
const idsAfter = new Set(r1.sections.map((s) => s.id));
const lost = beforeIds.filter((id) => !idsAfter.has(id));

console.log('--- 单次切换（tpl-01 → tpl-02） ---');
console.log('模块数 before/after :', beforeIds.length, '/', r1.sections.length);
console.log('自定义模块保留数    :', r1.sections.filter((s) => s.type === 'custom').length, '(期望 3)');
console.log('丢失的模块 id       :', lost.length ? lost : '无');
console.log('新顺序              :', r1.sections.map((s) => s.title).join(' | '));

// 2) 连续切换全部 22 套模板，确认模块数与内容始终不变
let cur = r0;
let minCount = Infinity;
const customCounts: number[] = [];
for (const t of TEMPLATES) {
  cur = applyTemplate(cur, t.id);
  minCount = Math.min(minCount, cur.sections.length);
  customCounts.push(cur.sections.filter((s) => s.type === 'custom').length);
}
console.log('--- 连续切遍 22 套模板 ---');
console.log('模块数最小值        :', minCount, '(期望', beforeIds.length, ')');
console.log('自定义模块数最小值  :', Math.min(...customCounts), '(期望 3)');
console.log('教育背景条目仍在    :', cur.sections.find((s) => s.type === 'education')!.items.length === 1);
console.log('技能富文本仍在      :', cur.sections.find((s) => s.type === 'skills')!.content === '<p>熟悉 TypeScript</p>');
console.log('最终模板            :', cur.style.templateId, '(期望', TEMPLATES[TEMPLATES.length - 1].id, ')');

const pass =
  lost.length === 0 &&
  r1.sections.filter((s) => s.type === 'custom').length === 3 &&
  minCount === beforeIds.length &&
  Math.min(...customCounts) === 3;
console.log('\n结果:', pass ? 'PASS ✅ 切模板不丢任何模块' : 'FAIL ❌');
if (!pass) process.exit(1);

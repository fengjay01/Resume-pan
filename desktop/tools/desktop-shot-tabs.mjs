/** 编辑器多标签条截图：注入 2 份测试简历，先后打开两份后截编辑器顶部（结束后恢复数据） */
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const SHOTS = path.resolve(ROOT, '..', 'shots');

const MINI = {
  basic: { avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false, workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '', customFields: [] },
  sections: [],
  style: { templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1, language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard', spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 } },
};

const seedEval = `(() => {
  localStorage.setItem('xl-tabs-test-backup', localStorage.getItem('xl-resume-data') || '');
  const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]},"version":0}');
  const mk = (id, name) => ({ ...${JSON.stringify(MINI)}, id, name, createdAt: Date.now(), updatedAt: Date.now() });
  obj.state.resumes = [mk('xshot-t1', '后端开发工程师'), mk('xshot-t2', '前端开发工程师'), ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  return 'seeded';
})()`;

const steps = [
  { eval: seedEval },
  { eval: `location.href = '/editor/xshot-t1'; 1` },
  { sleep: 3000 },
  { eval: `location.href = '/editor/xshot-t2'; 1` },
  { sleep: 3500 },
];

const stepsB64 = Buffer.from(JSON.stringify(steps)).toString('base64');
const child = spawn(ELECTRON, [
  '.', '--smoke',
  `--shot=${path.join(SHOTS, 'editor-tabs.png')}`,
  `--shot-steps=${stepsB64}`,
], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { out += d; });
const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } console.error('timeout:', out.slice(-400)); process.exit(1); }, 90000);
child.on('exit', () => {
  clearTimeout(timer);
  console.log(out.includes('shot saved') ? '截图完成（数据已自动恢复）' : `failed: ${out.slice(-400)}`);
  process.exit(out.includes('shot saved') ? 0 : 1);
});

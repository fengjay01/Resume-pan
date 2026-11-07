/**
 * 批量操作 UI 截图（node tools/desktop-shot-batch.mjs）
 * 自行 spawn electron --smoke --shot --shot-steps：注入临时数据 → 点击 → capturePage 截图 →
 * 主进程自动恢复 xl-shot-backup 备份后退出。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const SHOTS = path.resolve(ROOT, '..', 'shots');

const MINI = {
  basic: {
    avatar: '', name: '', gender: '', birthDate: '', showAgeOnly: false,
    workYears: '', jobIntention: '', phone: '', email: '', politicalStatus: '',
    customFields: [],
  },
  sections: [],
  style: {
    templateId: 'tpl-01', theme: 'blue', font: 'default', fontScale: 1,
    language: 'zh', layout: 'left', infoMode: 'text', lineSpacing: 'standard',
    spacing: { sectionGap: 16, lineHeight: 1.85, marginX: 40, marginTop: 40, marginBottom: 35 },
  },
};

/** 备份当前数据并注入 3 份演示简历 */
const seedEval = `(() => {
  localStorage.setItem('xl-shot-backup', localStorage.getItem('xl-resume-data') || '');
  const obj = JSON.parse(localStorage.getItem('xl-resume-data') || '{"state":{"resumes":[],"trashed":[]},"version":0}');
  const mk = (id, name) => ({ ...${JSON.stringify(MINI)}, id, name, createdAt: Date.now(), updatedAt: Date.now() });
  obj.state.resumes = [mk('xshot-1', '后端开发工程师'), mk('xshot-2', '前端开发工程师'), mk('xshot-3', '算法工程师'), ...obj.state.resumes];
  localStorage.setItem('xl-resume-data', JSON.stringify(obj));
  return 'seeded';
})()`;

const gotoResumes = `location.href = '/resumes'; 1`;
const click = (contains, exact) => `(() => {
  const bs = Array.from(document.querySelectorAll('button')).filter((x) => x.textContent${exact ? '.trim() ===' : '.includes('} ${JSON.stringify(contains)}${exact ? '' : ')'});
  bs.pop()?.click();
  return bs.length;
})()`;
/** 勾选批量删除弹窗里前 n 个非「测试」复选项 */
const check = (n) => `(() => {
  const dlg = Array.from(document.querySelectorAll('.fixed')).find((d) => d.textContent.includes('批量删除简历'));
  const labels = Array.from(dlg?.querySelectorAll('label') || []).filter((l) => !l.textContent.includes('测试'));
  labels.slice(0, ${n}).forEach((l) => l.querySelector('input[type="checkbox"]').click());
  return labels.length;
})()`;

function runShot(outFile, steps) {
  return new Promise((resolve, reject) => {
    const stepsB64 = Buffer.from(JSON.stringify(steps)).toString('base64');
    const child = spawn(ELECTRON, [
      '.', '--smoke',
      `--shot=${path.join(SHOTS, outFile)}`,
      `--shot-steps=${stepsB64}`,
    ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* */ } reject(new Error(`timeout: ${out.slice(-400)}`)); }, 60000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (out.includes('shot saved')) resolve();
      else reject(new Error(`exit ${code}: ${out.slice(-400)}`));
    });
  });
}

console.log('① 截图：批量操作下拉…');
await runShot('batch-dropdown.png', [
  { eval: seedEval },
  { eval: gotoResumes },
  { sleep: 2500 },
  { eval: click('批量操作') },
  { sleep: 700 },
]);

console.log('② 截图：批量删除弹窗…');
await runShot('batch-delete-modal.png', [
  { eval: seedEval },
  { eval: gotoResumes },
  { sleep: 2500 },
  { eval: click('批量操作') },
  { sleep: 600 },
  { eval: click('批量删除', true) },
  { sleep: 900 },
  { eval: check(2) },
  { sleep: 500 },
]);

try { rmSync(path.join(tmpdir(), 'xl-shot-'), { recursive: true, force: true }); } catch { /* */ }
console.log('完成');

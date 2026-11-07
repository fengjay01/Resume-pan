(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  /* ① 间距步进 0.01：滚轮一格 ±0.01 */
  [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('间距'))?.click();
  await sleep(700);
  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes[0].style.spacing;
  const sliders = [...document.querySelectorAll('input[type=range]')];
  out.push('① 5 个滑杆 step: ' + JSON.stringify(sliders.map((s) => s.step)));
  const track = sliders[0].parentElement;
  const before = store().sectionGap;
  track.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  await sleep(300);
  out.push('② 滚轮上滑: ' + before + ' → ' + store().sectionGap + (Math.abs(store().sectionGap - (before + 0.01)) < 1e-9 ? ' ✓ (+0.01)' : ' ✗'));

  /* ③ 基本信息：出生日期改用年月面板 */
  [...document.querySelectorAll('[role=button]')].find((e) => (e.textContent || '').trim() === '基本信息')?.click();
  await sleep(800);
  const birth = [...document.querySelectorAll('[role=button]')].find((d) =>
    (d.textContent || '').includes('2002/01'));
  out.push('③ 出生日期框显示: ' + (birth ? (birth.textContent || '').trim() : '未找到') + '（原数据 2002-01-01 → 应显示 2002/01）');
  // 打开面板
  birth?.click();
  await sleep(400);
  const panel = document.querySelector('[data-month-panel]');
  out.push('④ 面板打开: ' + (panel ? '✓ 头部=' + (panel.querySelector('div > button:nth-child(2)')?.textContent || '').trim() : '✗'));
  // 切十年视图选 1999 → 选 12月
  panel.querySelector('div > button:nth-child(2)').click();
  await sleep(250);
  const p2 = document.querySelector('[data-month-panel]');
  [...p2.querySelectorAll('.grid button')].find((c) => c.textContent === '1999')?.click();
  await sleep(250);
  const p3 = document.querySelector('[data-month-panel]');
  [...p3.querySelectorAll('.grid button')].find((c) => c.textContent === '12月')?.click();
  await sleep(400);
  const basic = JSON.parse(localStorage.getItem('xl-resume-data')).state.resumes[0].basic;
  out.push('⑤ 选 1999年12月 → birthDate = ' + basic.birthDate + (basic.birthDate === '1999-12' ? ' ✓' : ' ✗'));
  out.push('   框显示: ' + (birth?.textContent || '').trim());
  // 年龄联动（24岁左右）
  const preview = document.querySelector('.resume-page')?.textContent || '';
  out.push('⑥ 预览年龄联动: ' + (/\d+岁/.test(preview) ? '✓ 含「N岁」' : '✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | '))

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const navItems = () => [...document.querySelectorAll('[role=button]')];
  const dotOf = (title) => {
    const item = navItems().find((e) => (e.textContent || '').trim().startsWith(title));
    return item ? getComputedStyle(item.querySelector('span')).backgroundColor : null;
  };
  const BLUE = 'rgb(37, 99, 235)';

  // ① 添加预设「项目经历」（空模块）→ 圆点应立即点亮
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('添加模块'))?.click();
  await sleep(500);
  [...document.querySelectorAll('div[class*="z-[1000]"] button')].find(
    (b) => (b.textContent || '').trim() === '项目经历',
  )?.click();
  await sleep(800);
  out.push('① 新添加（空）项目经历圆点: ' + dotOf('项目经历') + (dotOf('项目经历') === BLUE ? ' ✓ 点亮' : ' ✗'));

  // ② 隐藏它 → 变灰
  const item = navItems().find((e) => (e.textContent || '').trim().startsWith('项目经历'));
  const r = item.getBoundingClientRect();
  item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 30, clientY: r.top + 20 }));
  await sleep(400);
  document.querySelector('div.fixed.z-50 [role=switch]')?.click();
  await sleep(500);
  out.push('② 关闭显隐开关后: ' + dotOf('项目经历') + (dotOf('项目经历') !== BLUE ? ' ✓ 变灰' : ' ✗'));

  // ③ 再打开 → 复亮
  item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 30, clientY: r.top + 20 }));
  await sleep(400);
  document.querySelector('div.fixed.z-50 [role=switch]')?.click();
  await sleep(500);
  out.push('③ 重新打开后: ' + dotOf('项目经历') + (dotOf('项目经历') === BLUE ? ' ✓ 复亮' : ' ✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

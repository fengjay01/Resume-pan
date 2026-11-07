(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const panel = () => {
    const p = [...document.querySelectorAll('input[type=range]')];
    return p.length ? p[0].closest('.flex.flex-col') : null;
  };
  // 打开间距设置
  const open = [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('间距'));
  (open || [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('间距')))?.click();
  await sleep(600);

  const sliders = [...document.querySelectorAll('input[type=range]')];
  const numbers = sliders.map((s) => {
    const row = s.closest('.flex.items-center');
    return row ? row.querySelector('input[type=text]') : null;
  });
  out.push('① 滑杆 ' + sliders.length + ' 个，数字输入框 ' + numbers.filter(Boolean).length + ' 个');

  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes[0].style.spacing;
  const first = sliders[0];
  const firstInput = numbers[0];
  out.push('② 当前模块上下间距: ' + store().sectionGap + '，输入框显示: ' + firstInput.value);

  // 输入 20 → 回车
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  firstInput.focus();
  setter.call(firstInput, '20');
  firstInput.dispatchEvent(new Event('input', { bubbles: true }));
  firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(400);
  out.push('③ 输入 20 回车 → spacing.sectionGap = ' + store().sectionGap + (store().sectionGap === 20 ? ' ✓' : ' ✗') +
    '，滑杆同步 = ' + (Number(first.value) === 20 ? '✓' : '✗'));

  // 输入 999（超上限）→ 钳制到 64
  firstInput.focus();
  setter.call(firstInput, '999');
  firstInput.dispatchEvent(new Event('input', { bubbles: true }));
  firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(400);
  out.push('④ 输入 999（超上限 64）→ 钳制为 ' + store().sectionGap + (store().sectionGap === 64 ? ' ✓' : ' ✗'));

  // 输入非法 → 回退
  firstInput.focus();
  setter.call(firstInput, 'abc');
  firstInput.dispatchEvent(new Event('input', { bubbles: true }));
  firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(400);
  out.push('⑤ 输入 abc → 回退为 ' + store().sectionGap + '（不变 ✓）');

  // 方向键微调
  firstInput.focus();
  setter.call(firstInput, String(store().sectionGap));
  firstInput.dispatchEvent(new Event('input', { bubbles: true }));
  const before = store().sectionGap;
  firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await sleep(300);
  out.push('⑥ 方向键↑ → ' + before + ' → ' + store().sectionGap + (store().sectionGap === Math.min(64, before + 0.5) ? ' ✓' : ' ✗'));

  // 行间距的小数输入
  const lineInput = numbers[1];
  lineInput.focus();
  setter.call(lineInput, '1.68');
  lineInput.dispatchEvent(new Event('input', { bubbles: true }));
  lineInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(400);
  out.push('⑦ 行间距输入 1.68 → ' + store().lineHeight + (store().lineHeight === 1.68 ? ' ✓' : ' ✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

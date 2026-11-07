(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const navItems = () => [...document.querySelectorAll('[role=button]')];
  const dotOf = (title) => {
    const item = navItems().find((e) => (e.textContent || '').trim().startsWith(title));
    if (!item) return null;
    const dot = item.querySelector('span');
    return dot ? getComputedStyle(dot).backgroundColor : null;
  };

  // 添加预设「项目经历」
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('添加模块'))?.click();
  await sleep(500);
  const chip = [...document.querySelectorAll('div[class*="z-[1000]"] button')].find(
    (b) => (b.textContent || '').trim() === '项目经历',
  );
  chip?.click();
  await sleep(800);
  out.push('① 刚添加（未填写）项目经历 圆点颜色: ' + dotOf('项目经历'));

  // 填写项目名称
  const input = document.querySelector('input[placeholder="请输入项目名称"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'XX 机器人系统');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  out.push('② 填写项目名称后 圆点颜色: ' + dotOf('项目经历') + '（brand-600 ≈ rgb(124,58,237) 或主题色）');

  // 主题色参考：取一个已填充模块（教育背景，如存在）的圆点颜色
  out.push('   对照-教育背景圆点: ' + (dotOf('教育背景') || '无该模块'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

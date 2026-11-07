(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const navTitles = () =>
    [...document.querySelectorAll('[role=button]')]
      .map((e) => (e.textContent || '').trim())
      .filter((t) => t && t !== '添加模块');
  const openModal = async () => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('添加模块'))?.click();
    await sleep(500);
    return [...document.querySelectorAll('div[class*="z-[1000]"] button')].filter((b) =>
      /^(教育背景|专业技能|工作经历|实习经历|项目经历|校园经历|获奖情况|科研经历|自我评价)$/.test((b.textContent || '').trim()),
    );
  };

  /* ① 已添加标记：再开一次弹窗，「项目经历」应显示已添加 */
  let chips = await openModal();
  const proj = chips.find((c) => (c.textContent || '').trim() === '项目经历');
  out.push('① 「项目经历」有已添加标记: ' + (proj.querySelector('span') ? '✓' : '✗'));
  await sleep(200);

  /* ② 加一个预设「教育背景」 */
  const edu = chips.find((c) => (c.textContent || '').trim() === '教育背景');
  edu.click();
  await sleep(700);
  out.push('② 加「教育背景」后导航: ' + navTitles().join('、'));
  // 教育背景是 list 条目式 → 表单里应有「学校名称」
  out.push('   学校名称输入框: ' + (document.querySelector('input[placeholder="学校名称"]') ? '✓' : '✗'));

  /* ③ 自定义模块（重新打开弹窗：加预设后会自动关闭） */
  await openModal();
  const input = [...document.querySelectorAll('input')].find((i) =>
    (i.placeholder || '').includes('模块名称'),
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '志愿者经历');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);
  const addBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '添加');
  addBtn.click();
  await sleep(700);
  out.push('③ 自定义模块「志愿者经历」: ' + (navTitles().includes('志愿者经历') ? '✓ 已出现在导航' : '✗ ' + navTitles().join('、')));

  /* ④ 悬停原生模块（项目经历）→ 浮层应有删除按钮 */
  const navItem = [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('教育背景'),
  );
  const r = navItem.getBoundingClientRect();
  navItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 30, clientY: r.top + 20 }));
  await sleep(400);
  const pill = document.querySelector('div.fixed.z-50');
  const del = pill?.querySelector('button[aria-label="删除模块"]');
  out.push('④ 预设模块（教育背景）浮层删除按钮: ' + (del ? '✓ 有' : '✗ 无'));
  del.click();
  await sleep(600);
  out.push('   删除后导航: ' + navTitles().join('、'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

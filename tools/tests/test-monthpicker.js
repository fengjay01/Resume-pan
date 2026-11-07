(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  // 进入项目经历模块
  [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('项目经历'))?.click();
  await sleep(800);

  // 项目时间字段的触发框（开始）
  const triggers = [...document.querySelectorAll('[role=button][title*="点击选择年月"]')];
  out.push('① 年月选择框数量: ' + triggers.length);
  const start = triggers[0];
  out.push('   开始框显示: ' + (start.textContent || '').trim());

  // 点开面板（月视图）
  start.click();
  await sleep(400);
  const panel = document.querySelector('[data-month-panel]');
  if (!panel) return 'NO_PANEL';
  out.push('② 面板头部: ' + (panel.querySelector('button:nth-child(2)')?.textContent || '').trim());
  const cells = [...panel.querySelectorAll('.grid button')];
  out.push('   月格子数: ' + cells.length + ' → ' + cells.slice(0, 4).map((c) => c.textContent).join(' '));
  const active = cells.find((c) => c.className.includes('bg-brand-600'));
  out.push('   高亮月份: ' + (active ? active.textContent : '无') + '（应与开始框一致）');

  // 选 9 月
  cells.find((c) => c.textContent === '9月')?.click();
  await sleep(400);
  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes[0].sections
    .flatMap((s) => s.items || []).find((i) => i.startDate)?.startDate;
  out.push('③ 点 9月 → 面板关闭: ' + (document.querySelector('[data-month-panel]') ? '✗' : '✓') +
    '，开始框显示: ' + (start.textContent || '').trim());

  // 头部切十年视图
  start.click();
  await sleep(300);
  const p2 = document.querySelector('[data-month-panel]');
  p2.querySelector('div > button:nth-child(2)')?.click(); // 头部文字
  await sleep(300);
  const p3 = document.querySelector('[data-month-panel]');
  const yCells = [...p3.querySelectorAll('.grid button')];
  out.push('④ 十年视图: 头部=' + (p3.querySelector('div > button:nth-child(2)')?.textContent || '').trim() +
    '，年份格子=' + yCells.length + ' → ' + yCells.slice(0, 5).map((c) => c.textContent).join(' '));
  const dim = yCells.filter((c) => c.className.includes('text-ink-300')).length;
  out.push('   置灰年份（decade 外）: ' + dim + '（应为 2）');

  // 点 2024 → 回月视图
  yCells.find((c) => c.textContent === '2024')?.click();
  await sleep(300);
  const p4 = document.querySelector('[data-month-panel]');
  out.push('⑤ 点 2024 → 返回月视图: ' + (p4 ? '✓ 头部=' + (p4.querySelector('div > button:nth-child(2)')?.textContent || '').trim() : '✗'));
  // 选 2024年5月
  [...p4.querySelectorAll('.grid button')].find((c) => c.textContent === '5月')?.click();
  await sleep(300);
  out.push('⑥ 选 2024/05 后开始框: ' + (start.textContent || '').trim());

  // 清除按钮
  const clear = start.querySelector('button[title="清除"]');
  clear?.click();
  await sleep(300);
  out.push('⑦ 清除后开始框: "' + (start.textContent || '').trim() + '"（应为占位符「开始」）');

  // ⑧ 回归：新添加条目的日期选择器（曾经只有第一个条目的面板能正常显示——
  //    pos 算了没传给面板，fixed 无 left/top 停留在静态流位置，折叠下方就不可见）
  const addBtn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').trim().startsWith('添加项目经历'));
  if (addBtn) {
    addBtn.click();
    await sleep(600);
    const all = [...document.querySelectorAll('[role=button][title*="点击选择年月"]')];
    out.push('⑧ 添加条目后触发器数量: ' + all.length + '（应+2）');
    const last = all[all.length - 1];
    last.scrollIntoView({ block: 'center' });
    await sleep(300);
    last.click();
    await sleep(400);
    const p8 = document.querySelector('[data-month-panel]');
    if (!p8) {
      out.push('   ✗ 新条目点击后无面板');
    } else {
      const r = p8.getBoundingClientRect();
      const tr = last.getBoundingClientRect();
      const inView = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      const aligned = Math.abs(r.left - tr.left) <= 4;
      out.push('   新条目面板: 视口内=' + inView + '，与触发器水平对齐=' + aligned +
        '，rect=(' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
      if (!inView || !aligned) out.push('   ✗ 面板定位错误（回归！）');
      else {
        p8.querySelector('.grid button')?.click();
        await sleep(400);
        out.push('   选月后框内: "' + (last.textContent || '').trim() + '"（应为 YYYY/MM）');
      }
    }
  }
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | '))

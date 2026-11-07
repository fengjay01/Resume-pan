(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  // 打开「添加模块」
  const addBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('添加模块'));
  if (!addBtn) return 'NO_ADD_BTN';
  addBtn.click();
  await sleep(500);
  // 弹窗里的预设块
  const chips = [...document.querySelectorAll('div[class*="z-[1000]"] button')].filter((b) =>
    b.querySelector('svg') && /^(教育背景|专业技能|工作经历|实习经历|项目经历|校园经历|获奖情况|科研经历|自我评价)$/.test((b.textContent || '').trim()),
  );
  out.push('① 预设模块数: ' + chips.length + ' → ' + chips.map((c) => (c.textContent || '').trim()).join('、'));
  out.push('   自定义输入框: ' + (document.querySelector('div[class*="z-[1000]"] input[type=text], div[class*="z-[1000]"] input:not([type])') ? '有' : '无'));
  // 点「项目经历」
  const proj = chips.find((c) => (c.textContent || '').trim() === '项目经历');
  proj.click();
  await sleep(800);
  const nav = [...document.querySelectorAll('[role=button]')].map((e) => (e.textContent || '').trim());
  out.push('② 点「项目经历」后导航: ' + nav.filter((t) => t && t !== '添加模块').join('、'));
  // 当前激活的是新加的项目经历 → 编辑表单应是「条目式」（有名称/职位输入框 + 添加条目）
  const labels = [...document.querySelectorAll('label')].map((l) => l.textContent.trim()).slice(0, 8);
  out.push('③ 编辑表单字段: ' + JSON.stringify(labels));
  const hasListForm = !!document.querySelector('input[placeholder*="项目名称"], input[placeholder*="公司名称"]');
  out.push('   条目式表单（与模板原生项目经历一致）: ' + (hasListForm ? '✓' : '✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

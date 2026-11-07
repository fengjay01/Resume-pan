(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const openModal = async () => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('添加模块'))?.click();
    await sleep(500);
    return [...document.querySelectorAll('div[class*="z-[1000]"] button')].filter((b) =>
      /^(教育背景|专业技能|工作经历|实习经历|项目经历|校园经历|获奖情况|科研经历|自我评价)$/.test((b.textContent || '').trim()),
    );
  };

  /* ① 加「项目经历」 */
  let chips = await openModal();
  chips.find((c) => (c.textContent || '').trim() === '项目经历').click();
  await sleep(900);

  /* ② 重开弹窗：项目经历应有「已添加」标记 */
  chips = await openModal();
  const proj = chips.find((c) => (c.textContent || '').trim() === '项目经历');
  out.push('① 已添加标记: ' + (proj.querySelector('span') ? '✓（右上角 ✓ 角标）' : '✗'));
  // 关闭弹窗（点遮罩外的取消不可用，用 Escape）
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(400);

  /* ③ 编辑表单与模板原生一致：项目名称 / 项目角色 / 项目时间 */
  out.push('② 项目名称输入框: ' + (document.querySelector('input[placeholder="请输入项目名称"]') ? '✓' : '✗'));
  out.push('   项目角色输入框: ' + (document.querySelector('input[placeholder="请输入项目角色"]') ? '✓' : '✗'));
  // 渲染：简历上应出现「项目经历」标题（模板样式）
  const pageText = document.querySelector('.resume-page')?.textContent || '';
  out.push('③ 简历渲染含「项目经历」标题: ' + (pageText.includes('项目经历') ? '✓' : '✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

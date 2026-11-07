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

  /* ① 添加「项目经历」并填入内容（空模块在预览里会被自动隐藏，是正常规则） */
  const chips = await openModal();
  chips.find((c) => (c.textContent || '').trim() === '项目经历').click();
  await sleep(900);
  const setVal = (input, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('input[placeholder="请输入项目名称"]'), 'XX 机器人系统');
  setVal(document.querySelector('input[placeholder="请输入项目角色"]'), '核心开发');
  await sleep(900);

  /* ② 切到「图标线条」版式：验证新加模块的标题带模板同款圆图标 */
  const tplBtn = [...document.querySelectorAll('button')].find((b) => b.title === '展开模板设置');
  tplBtn.click();
  await sleep(500);
  [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('图标线条'))?.click();
  await sleep(900);

  /* ③ 检查预览：新模块标题带图标 + 横线，与模板原生模块一致 */
  const page = document.querySelector('.resume-page');
  const spans = [...page.querySelectorAll('span')].filter(
    (e) => (e.textContent || '').trim() === '项目经历' && e.children.length === 0,
  );
  let withIcon = false;
  for (const sp of spans) {
    if (sp.parentElement?.querySelector('svg')) withIcon = true;
  }
  out.push('① 预览含「项目经历」标题: ' + (spans.length ? '✓' : '✗'));
  out.push('② 标题带模板同款圆图标（图标线条版式）: ' + (withIcon ? '✓' : '✗'));
  // 渲染内容：项目名称进了简历
  out.push('③ 项目内容渲染: ' + (page.textContent.includes('XX 机器人系统') ? '✓' : '✗'));
  // 截图定位：滚到该标题
  const target = spans[0];
  if (target) {
    target.scrollIntoView({ block: 'center' });
    await sleep(500);
  }
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const out = [];
  const cards = () => [...document.querySelectorAll('[data-resume-id]')];
  const names = () => cards().map((w) => (w.querySelector('h3')?.textContent || '').trim().replace(/-.*$/, ''));
  const pt = (el, x, y, type, id = 1) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, button: 0, buttons: 1, clientX: x, clientY: y }));
  const dialog = () => [...document.querySelectorAll('div')].find((d) => d.className.includes('z-[1000]') && d.querySelector('button'));
  const btnIn = (root, t) => [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === t);

  /* ---------- ③ 删除弹窗：移入回收站 / 彻底删除 ---------- */
  const before = names().join(' | ');
  const card = cards()[2];
  const cardName = (card.querySelector('h3')?.textContent || '').trim();
  btnIn(card, '删除')?.click();
  await sleep(450);
  const d1 = dialog();
  out.push('① 删除弹窗按钮: ' + [...d1.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).join(' / '));
  btnIn(d1, '彻底删除')?.click();
  await sleep(600);
  const trash = JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.trashed || [];
  out.push('   彻底删除后：列表含该简历=' + (names().includes(cardName) ? 'Y(错)' : 'N ✓') + '，回收站条数=' + trash.length + '（应不变）');
  out.push('   toast：' + (document.querySelector('.animate-slide-up')?.textContent || '无').trim());

  /* ---------- ② 拖拽落位后不再「二次移动」 ---------- */
  const dragTo = async (fromIdx, dy) => {
    const src = cards()[fromIdx];
    const r0 = src.getBoundingClientRect();
    const gx = r0.left + 200;
    const gy = r0.top + 60;
    pt(src, gx, gy, 'pointerdown');
    await sleep(60);
    for (let d = 14; Math.abs(d) <= Math.abs(dy); d += dy < 0 ? -14 : 14) {
      pt(window, gx, gy + d, 'pointermove');
      await frame();
      await sleep(12);
    }
    pt(window, gx, gy + dy, 'pointerup');
  };
  const order0 = names().join(' | ');
  await dragTo(1, -420);
  await sleep(700);                       // 落位动画结束
  const topName = names()[0];
  const c = cards().find((w) => (w.querySelector('h3')?.textContent || '').trim().startsWith(topName));
  const top1 = c.getBoundingClientRect().top;
  const tf1 = getComputedStyle(c).transform;
  await sleep(3200);                      // 越过 toast 消失（2.2s）触发的重渲染
  const top2 = c.getBoundingClientRect().top;
  const tf2 = getComputedStyle(c).transform;
  out.push('② 拖拽前顺序: ' + order0);
  out.push('   拖拽后顺序: ' + names().join(' | '));
  out.push('   落位后 3.2s 卡片 top: ' + Math.round(top1) + ' → ' + Math.round(top2) + '（应相等）');
  out.push('   computed transform: ' + (tf1 || 'none') + ' / ' + (tf2 || 'none'));
  out.push('   二次移动: ' + (Math.abs(top2 - top1) < 0.6 ? '✓ 无' : '✗ 有（移动 ' + (top2 - top1).toFixed(1) + 'px）'));
  out.push('   顺序持久化: ' + (JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes.map((r) => r.name).join(' | ')));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e && e.message ? e.message : e))

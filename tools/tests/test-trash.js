(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state || {};
  const cards = () => [...document.querySelectorAll('[data-resume-id]')];
  const names = () => cards().map((w) => (w.querySelector('h3')?.textContent || '').trim());
  const btnByText = (root, t) =>
    [...root.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === t);
  const dialog = () =>
    [...document.querySelectorAll('div')].find(
      (d) => d.className.includes('z-[1000]') && d.querySelector('button'),
    );

  out.push('① 初始：在用 ' + names().length + ' 份，回收站 ' + (store().trashed || []).length + ' 条（种子给 2 条）');
  out.push('   过期的 31 天条目已被自动清理：' + ((store().trashed || []).length === 1 ? '✓' : '✗'));
  const badge = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('回收站'),
  );
  out.push('   顶部「回收站」按钮文案：' + (badge ? badge.textContent.trim() : '未找到'));

  /* ---------- ② 删除 → 进回收站 ---------- */
  const target = cards()[1];
  const targetName = (target.querySelector('h3')?.textContent || '').trim();
  btnByText(target, '删除')?.click();
  await sleep(400);
  const dl = dialog();
  const dlText = dl ? dl.textContent : '';
  out.push('② 删除确认弹窗：' + (dlText.includes('回收站') ? '✓ 提示会进回收站' : '✗ ' + dlText.slice(0, 60)));
  [...dl.querySelectorAll('button')].find((b) => b.textContent.trim() === '移入回收站')?.click();
  await sleep(600);
  out.push('   删除后：在用 ' + names().length + ' 份，回收站 ' + (store().trashed || []).length + ' 条');
  out.push('   列表里已无「' + targetName + '」：' + (names().includes(targetName) ? '✗' : '✓'));
  const toast = document.querySelector('.animate-slide-up');
  out.push('   toast：' + (toast ? toast.textContent.trim() : '无'));

  /* ---------- ③ 回收站页面 ---------- */
  const trashBtn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('回收站'),
  );
  trashBtn.click();
  await sleep(900);
  const items = [...document.querySelectorAll('[data-trash-id]')];
  out.push('③ 回收站页：' + items.length + ' 条');
  items.forEach((it) => {
    const h3 = it.querySelector('h3');
    const days = [...it.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => t.includes('天后'));
    out.push('   · ' + (h3 ? h3.textContent.trim() : '?') + ' → ' + days);
  });

  /* ---------- ④ 恢复 ---------- */
  const restoreName = items.find((it) =>
    (it.querySelector('h3')?.textContent || '').includes(targetName),
  );
  btnByText(restoreName, '恢复')?.click();
  await sleep(700);
  out.push('④ 恢复「' + targetName + '」后：回收站 ' + (store().trashed || []).length + ' 条');
  out.push('   toast：' + (document.querySelector('.animate-slide-up')?.textContent || '无').trim());

  // 回列表看是否回到原位（原 index=1）
  location.hash = '';
  window.history.pushState({}, '', '/resumes');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await sleep(900);
  out.push('   回到列表：' + names().join(' | '));
  out.push('   恢复后位于第 2 位（原位）：' + (names()[1] === targetName ? '✓' : '✗ 实际第 ' + (names().indexOf(targetName) + 1) + ' 位'));

  /* ---------- ⑤ 彻底删除 + 清空 ---------- */
  // 再删两份
  for (const n of [names()[0], names()[names().length - 1]]) {
    const c = cards().find((x) => (x.querySelector('h3')?.textContent || '').trim() === n);
    btnByText(c, '删除')?.click();
    await sleep(300);
    const d2 = dialog();
    [...d2.querySelectorAll('button')].find((b) => b.textContent.trim() === '移入回收站')?.click();
    await sleep(500);
  }
  out.push('⑤ 再删 2 份后：在用 ' + names().length + ' 份，回收站 ' + (store().trashed || []).length + ' 条');

  window.history.pushState({}, '', '/resumes/trash');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await sleep(900);
  const items2 = [...document.querySelectorAll('[data-trash-id]')];
  out.push('   回收站页 ' + items2.length + ' 条');
  // 彻底删除一条
  btnByText(items2[0], '彻底删除')?.click();
  await sleep(400);
  const d3 = dialog();
  out.push('   彻底删除弹窗：' + (d3.textContent.includes('不可恢复') ? '✓ 警告不可恢复' : '✗'));
  [...d3.querySelectorAll('button')].find((b) => b.textContent.trim() === '彻底删除')?.click();
  await sleep(600);
  out.push('   彻底删除后剩 ' + (store().trashed || []).length + ' 条');

  // 清空
  const emptyBtn = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('清空回收站'),
  );
  emptyBtn.click();
  await sleep(400);
  const d4 = dialog();
  [...d4.querySelectorAll('button')].find((b) => b.textContent.trim() === '清空')?.click();
  await sleep(600);
  out.push('   清空后剩 ' + (store().trashed || []).length + ' 条，页面 ' + document.querySelectorAll('[data-trash-id]').length + ' 条');
  out.push('   空状态文案：' + (document.body.textContent.includes('回收站是空的') ? '✓ 显示「回收站是空的」' : '✗'));

  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e))

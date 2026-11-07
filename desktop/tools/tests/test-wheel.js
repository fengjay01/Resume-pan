(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  // 打开间距面板
  [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('间距'))?.click();
  await sleep(700);
  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes[0].style.spacing;
  const tracks = [...document.querySelectorAll('input[type=range]')].map((r) => r.parentElement);
  out.push('① 滑杆数量: ' + tracks.length);

  // 悬停第 1 个滑杆（模块上下间距），滚轮上滑 → +step
  const before = store().sectionGap;
  tracks[0].dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  await sleep(300);
  out.push('② 滚轮上滑: ' + before + ' → ' + store().sectionGap +
    (store().sectionGap === Math.min(64, before + 0.5) ? ' ✓ (+0.5)' : ' ✗'));

  // 滚轮下滑 → -step
  const b2 = store().sectionGap;
  tracks[0].dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  await sleep(300);
  out.push('③ 滚轮下滑: ' + b2 + ' → ' + store().sectionGap + (store().sectionGap === b2 - 0.5 ? ' ✓ (-0.5)' : ' ✗'));

  // 滑到最小值后再下滑 → 钳制在 min
  for (let i = 0; i < 60; i += 1) {
    tracks[0].dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await sleep(400);
  out.push('④ 连续下滑到下限: ' + store().sectionGap + (store().sectionGap === 0 ? ' ✓ 钳制为 0' : ' ✗'));

  // preventDefault：页面/面板不跟着滚
  const scroller = document.querySelector('main, [class*=overflow]');
  const scrollBefore = scroller ? scroller.scrollTop : 0;
  tracks[0].dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  await sleep(200);
  const scrollAfter = scroller ? scroller.scrollTop : 0;
  out.push('⑤ 页面未被滚轮滚动: ' + (scrollBefore === scrollAfter ? '✓' : '✗ ' + scrollBefore + '→' + scrollAfter));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

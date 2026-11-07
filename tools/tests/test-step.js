(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('间距'))?.click();
  await sleep(700);
  const store = () => JSON.parse(localStorage.getItem('xl-resume-data') || '{}').state.resumes[0].style.spacing;
  const sliders = [...document.querySelectorAll('input[type=range]')];
  out.push('① 各滑杆 step: ' + JSON.stringify(sliders.map((s) => s.step)));
  // 滚轮上滑一格 → +0.1
  const track = sliders[0].parentElement;
  const before = store().sectionGap;
  track.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  await sleep(300);
  out.push('② 滚轮上滑: ' + before + ' → ' + store().sectionGap + (store().sectionGap === before + 0.1 ? ' ✓ (+0.1)' : ' ✗'));
  // 拖动（设置 range 值走 step 吸附）
  const r = sliders[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, '10.07');
  r.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);
  out.push('③ 拖动吸附到 0.1 步进: ' + store().sectionGap + (Math.abs(store().sectionGap - 10.1) < 1e-9 || Math.abs(store().sectionGap - 10) < 1e-9 ? ' ✓' : ' ✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + e.message)

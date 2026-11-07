(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const nav = [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('项目经历'));
  nav?.click();
  await sleep(800);
  const ed = [...document.querySelectorAll('.rich-editor')].find((e) => e.querySelector('li'));
  if (!ed) return 'NO_EDITOR';
  const base = ed.innerHTML;

  const caretIn = (liIdx, frac) => {
    const li = ed.querySelectorAll('li')[liIdx];
    const findText = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 && c.textContent.length > 10) return c;
        const r = findText(c);
        if (r) return r;
      }
      return null;
    };
    const t = findText(li);
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(t, Math.floor(t.textContent.length * frac));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    ed.focus();
  };
  const paste = (html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    ed.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  };

  /* ① 粘贴「单个 <p>」到列表项文字中间 → 应行内接入，不产生换行/新列表项 */
  const liBefore = ed.querySelectorAll('li').length;
  const textBefore = ed.querySelector('li').textContent;
  caretIn(0, 0.5);
  paste('<p>【粘贴的一段话】</p>');
  await sleep(300);
  const li1 = ed.querySelector('li');
  const okInline =
    li1.textContent.includes('【粘贴的一段话】') &&
    li1.innerHTML.includes(textBefore.slice(0, 6)) &&
    ed.querySelectorAll('li').length === liBefore &&
    !li1.innerHTML.includes('<br>');
  out.push('① 单段粘贴行内接入（不换行、不加列表项）: ' + (okInline ? '✓' : '✗'));
  out.push('   结构: ' + li1.innerHTML.slice(0, 160).replace(/\s+/g, ' '));

  /* ② 粘贴两个 <p> → 拆成新列表项（Word 行为） */
  const liCountBefore = ed.querySelectorAll('li').length;
  const ul = ed.querySelector('ul, ol');
  const li2 = ul.querySelectorAll(':scope > li')[1] || ul.querySelectorAll(':scope > li')[0];
  const t2 = (function f(n){for(const c of n.childNodes){if(c.nodeType===3&&c.textContent.length>8)return c;const r=f(c);if(r)return r;}return null;})(li2);
  const sel = window.getSelection();
  const rr = document.createRange();
  rr.setStart(t2, Math.floor(t2.textContent.length / 2));
  rr.collapse(true);
  sel.removeAllRanges(); sel.addRange(rr); ed.focus();
  paste('<p>多段一</p><p>多段二</p>');
  await sleep(300);
  const liAfter = ed.querySelectorAll('li').length;
  const allLi = [...ed.querySelectorAll('li')].every((li) => !li.querySelector(':scope > p'));
  out.push('② 多段粘贴 → 新列表项: ' + (liAfter > liCountBefore ? '✓ (' + liCountBefore + '→' + liAfter + ')' : '✗') +
    '，结构合法（li 内无直接 p）: ' + (allLi ? '✓' : '✗'));

  /* ③ 撤销回到粘贴前 */
  ed.focus();
  ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  await sleep(300);
  out.push('③ Ctrl+Z 撤销多段粘贴: ' + (ed.querySelectorAll('li').length === liCountBefore ? '✓' : '✗'));

  /* ④ 恢复原内容，粘贴纯文本（走 markdown→<p>）也应行内接入 */
  ed.innerHTML = base;
  await sleep(300);
  caretIn(0, 0.5);
  paste('纯文本粘贴的一段话');
  await sleep(300);
  const li4 = ed.querySelector('li');
  out.push('④ 纯文本粘贴行内接入: ' +
    (li4.textContent.includes('纯文本粘贴的一段话') && !li4.innerHTML.includes('<br>') && ed.querySelectorAll('li').length === base.split('<li').length - 1 ? '✓' : '✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | '))

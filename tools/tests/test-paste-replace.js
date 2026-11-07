(async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nav = [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('项目经历'));
  nav?.click();
  await sleep(800);
  const ed = [...document.querySelectorAll('.rich-editor')].find((e) => e.querySelector('li'));
  if (!ed) return 'NO_EDITOR';
  const out = [];

  const selectAllInEditor = () => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(ed, 0);
    range.setEnd(ed, ed.childNodes.length);
    sel.removeAllRanges();
    sel.addRange(range);
    ed.focus();
  };
  const paste = (html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    ed.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  };

  const oldText = ed.textContent;
  const marker = 'NEWCONTENT-' + Date.now();

  /* ① 全选后粘贴块级内容 → 整个编辑器内容被替换（旧内容不残留） */
  selectAllInEditor();
  paste('<p>' + marker + '-A</p><p>' + marker + '-B</p>');
  await sleep(300);
  out.push({
    'case': '全选+粘贴块内容',
    'replaced': ed.textContent.indexOf(marker) >= 0 && ed.textContent.indexOf('算法') < 0,
    'noGhost': ed.textContent.indexOf(oldText.trim().slice(0, 8)) < 0 || oldText.trim().slice(0, 8) === '',
    'len': ed.textContent.length,
  });

  /* ② 选中单个 li 内的部分文字 + 粘贴块级内容 → 选区内文字被替换 */
  ed.innerHTML = '<ul><li>旧文字很长的一段内容在这里</li></ul>';
  const li = ed.querySelector('li');
  const t = li.firstChild;
  if (t && t.nodeType === 3) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(t, 0);
    range.setEnd(t, Math.min(4, t.textContent.length));
    sel.removeAllRanges();
    sel.addRange(range);
    paste('<p>替换文字X</p>');
    await sleep(300);
    out.push({ 'case': 'li内选区+粘贴', 'text': ed.textContent.slice(0, 40) });
  }

  /* ③ 折叠光标在空 li 粘贴块内容 → 不残留空 li */
  ed.innerHTML = '<ul><li></li></ul>';
  const sel2 = window.getSelection();
  const r2 = document.createRange();
  r2.setStart(ed.querySelector('li'), 0);
  r2.collapse(true);
  sel2.removeAllRanges();
  sel2.addRange(r2);
  paste('<p>块一</p><p>块二</p>');
  await sleep(300);
  const emptyLi = [...ed.querySelectorAll('li')].filter((e) => !e.textContent.trim() && !e.querySelector('img'));
  out.push({ 'case': '空li粘贴块', 'liCount': ed.querySelectorAll('li').length, 'emptyLi': emptyLi.length });

  return JSON.stringify(out);
})()

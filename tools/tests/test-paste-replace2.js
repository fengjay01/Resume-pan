(async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* 打开「实习经历」模块（内容含 ul，多 li） */
  const nav = [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('项目经历'));
  nav?.click();
  await sleep(800);
  const ed = [...document.querySelectorAll('.rich-editor')].find((e) => e.querySelector('li'));
  if (!ed) return 'NO_EDITOR';

  const describeSelection = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    const d = (n) => (n === ed ? 'EDITOR' : `${n.nodeName}#${(n.textContent || '').slice(0, 6)}`);
    return {
      collapsed: r.collapsed,
      start: `${d(r.startContainer)}@${r.startOffset}`,
      end: `${d(r.endContainer)}@${r.endOffset}`,
      coversAll:
        r.startContainer === ed && r.startOffset === 0 &&
        r.endContainer === ed && r.endOffset === ed.childNodes.length,
      text: r.toString().slice(0, 30),
    };
  };

  const out = { structure: ed.innerHTML.slice(0, 80) };

  /* 模拟用户的 Ctrl+A：contentEditable 里 Ctrl+A = selectAll 命令 */
  ed.focus();
  document.execCommand('selectAll');
  await sleep(120);
  out.realCtrlA = describeSelection();

  /* 手工构造「全选」Range（覆盖整个编辑器子节点） */
  const sel = window.getSelection();
  const r2 = document.createRange();
  r2.setStart(ed, 0);
  r2.setEnd(ed, ed.childNodes.length);
  sel.removeAllRanges();
  sel.addRange(r2);
  await sleep(80);
  out.manualAll = describeSelection();

  const paste = (html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', html.replace(/<[^>]+>/g, ''));
    ed.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  };

  /* ① 真 Ctrl+A 后粘贴两段块级内容 */
  ed.focus();
  document.execCommand('selectAll');
  await sleep(100);
  const oldText = ed.textContent;
  paste('<p>AAA新内容一</p><p>BBB新内容二</p>');
  await sleep(300);
  out.case1 = {
    text: ed.textContent.slice(0, 60),
    len: ed.textContent.length,
    replaced: ed.textContent.indexOf('AAA新内容一') >= 0 && ed.textContent.indexOf('BBB新内容二') >= 0,
    ghost: oldText.trim() ? ed.textContent.indexOf(oldText.trim().slice(0, 6)) >= 0 : false,
  };

  /* ② 真 Ctrl+A 后粘贴单个段落（行内内容） */
  ed.focus();
  document.execCommand('selectAll');
  await sleep(100);
  const old2 = ed.textContent;
  paste('<p>替换后的唯一一段</p>');
  await sleep(300);
  out.case2 = {
    text: ed.textContent.slice(0, 60),
    replaced: ed.textContent.trim() === '替换后的唯一一段',
    ghost: old2.trim() ? ed.textContent.indexOf(old2.trim().slice(0, 6)) >= 0 : false,
  };

  /* ③ 真 Ctrl+A 后粘贴“整份简历”式多段落 */
  ed.focus();
  document.execCommand('selectAll');
  await sleep(100);
  paste('<p>第1段</p><p>第2段</p><p>第3段</p><ul><li>列表A</li><li>列表B</li></ul>');
  await sleep(300);
  out.case3 = {
    text: ed.textContent.slice(0, 60),
    liCount: ed.querySelectorAll('li').length,
    replaced: ed.textContent.indexOf('第3段') >= 0 && ed.textContent.indexOf('列表B') >= 0,
  };

  return JSON.stringify(out, null, 1);
})()

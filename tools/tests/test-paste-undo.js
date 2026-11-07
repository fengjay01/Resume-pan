(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  // 进入「项目经历」模块，取带列表的富文本编辑器
  const nav = [...document.querySelectorAll('[role=button]')].find((e) =>
    (e.textContent || '').trim().startsWith('项目经历'));
  nav?.click();
  await sleep(800);
  const ed = [...document.querySelectorAll('.rich-editor')].find((e) => e.querySelector('li'));
  if (!ed) return 'NO_EDITOR';
  const before = ed.innerHTML;

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
  const key = (k, opts = {}) =>
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ctrlKey: !!opts.ctrl, shiftKey: !!opts.shift }));

  /* ① 光标在第 2 个 li 中间，粘贴两个段落 → 应拆分 li、插到光标处 */
  caretIn(1, 0.5);
  paste('<p>AAA 粘贴段落一</p><p>BBB 粘贴段落二</p>');
  await sleep(400);
  const html1 = ed.innerHTML;
  const liCount = ed.querySelectorAll('li').length;
  const posOk =
    html1.indexOf('AAA 粘贴段落一') > html1.indexOf('现场测试与问题闭环') &&
    html1.indexOf('AAA 粘贴段落一') < html1.indexOf('项目成果');
  const structureOk = !/<li>[^<]*<p[ >]/.test(html1) && !/<p>[^<]*<li[ >]/.test(html1);
  out.push('① 列表内粘贴到光标处: ' + (posOk ? '✓ 位置正确' : '✗'));
  out.push('   li 结构正常（无 p 套 li）: ' + (structureOk ? '✓' : '✗') + '，li 数量 = ' + liCount);

  /* ② Ctrl+Z 撤销 → 回到粘贴前 */
  ed.focus();
  key('z', { ctrl: true });
  await sleep(300);
  out.push('② Ctrl+Z 撤销粘贴: ' + (ed.innerHTML === before ? '✓ 内容回到粘贴前' : '✗ 仍含粘贴内容'));
  /* ③ Ctrl+Y 恢复 */
  key('y', { ctrl: true });
  await sleep(300);
  out.push('③ Ctrl+Y 恢复: ' + (ed.innerHTML === html1 ? '✓' : '✗'));

  /* ④ 光标在第 1 个 li 文字中间，粘贴行内内容 → 行内插入 */
  ed.innerHTML = before;
  await sleep(300);
  caretIn(0, 0.5);
  paste('<strong>【插入】</strong>');
  await sleep(300);
  out.push('④ 行内粘贴到光标处: ' + (ed.innerHTML.includes('<strong>【插入】</strong>') ? '✓' : '✗'));

  /* ⑤ 打字合并撤销：连续输入后一次 Ctrl+Z 撤销一段 */
  ed.innerHTML = before;
  await sleep(300);
  caretIn(0, 0.5);
  const strong = ed.querySelector('li strong');
  // 在 strong 内末尾连续输入 3 个字符
  for (const ch of ['甲', '乙', '丙']) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(strong, strong.childNodes.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('insertText', false, ch);
    await sleep(220); // > 500ms 合并窗口 → 每字一步；这里 220ms 会合并
  }
  const typed = ed.innerHTML;
  key('z', { ctrl: true });
  await sleep(300);
  out.push('⑤ 连续输入合并撤销: ' + (typed !== ed.innerHTML ? '✓ 可撤销' : '✗'));

  /* ⑥ 撤销后继续编辑 → 重做尾巴被清空 */
  key('y', { ctrl: true });
  await sleep(250);
  caretIn(0, 0.5);
  paste('<p>新内容</p>');
  await sleep(300);
  key('z', { ctrl: true });
  await sleep(300);
  const undone = ed.innerHTML;
  key('y', { ctrl: true });
  await sleep(300);
  out.push('⑥ 撤销→编辑→撤销/重做链正常: ' + (undone !== ed.innerHTML ? '✓' : '✗'));
  return JSON.stringify(out, null, 0);
})().catch((e) => 'ERR: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | '))

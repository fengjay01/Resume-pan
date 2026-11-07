/**
 * 图片版 PDF 的 OCR 冒烟测试。
 *
 * 前置：先跑 `python tools/make-pdf-fixture.py` 生成样本，并把图片版复制到能被 fetch 的位置：
 *   cp tools/fixtures/resume-image-300.pdf app/public/fixtures/
 * 跑完记得删掉（26MB，不该进构建产物）：
 *   rm app/public/fixtures/resume-image-300.pdf
 */
(async () => {
  const out = [];
  const mod = await import('/src/lib/resumeImport.ts');
  const buf = await (await fetch('/fixtures/resume-image-300.pdf')).arrayBuffer();
  const file = new File([buf], 'resume-image-300.pdf');

  const steps = [];
  const t0 = performance.now();
  const r = await mod.ocrResumeFile(file, (p) => {
    const last = steps[steps.length - 1];
    const tag = p.status + ' ' + Math.round(p.progress * 100) + '%';
    if (last !== tag) steps.push(tag);
  });
  const secs = ((performance.now() - t0) / 1000).toFixed(1);

  out.push('① OCR 用时 ' + secs + ' 秒');
  out.push('   进度节点: ' + steps.slice(0, 12).join(' → '));
  out.push('② 文本长度 ' + r.text.length + '，hint: ' + r.hint);
  out.push(
    '   前 16 行:\n' +
      r.text
        .split('\n')
        .slice(0, 16)
        .map((l, i) => '     ' + (i + 1) + '| ' + l)
        .join('\n'),
  );
  const parsed = mod.parseResumeText(r.text);
  out.push(
    '③ 识别模块: ' +
      parsed.sections
        .map((s) => s.title + '(' + (s.kind === 'list' ? s.items.length + '条' : 'rich') + ')')
        .join('、'),
  );
  out.push('   基本信息: ' + JSON.stringify(parsed.basic));
  const work = parsed.sections.find((s) => s.kind === 'list' && s.items.length);
  if (work) {
    const it = work.items[0];
    out.push(
      '   ' + work.title + ' 首条 → ' +
        JSON.stringify({ name: it.name, role: it.role, start: it.startDate, end: it.endDate, current: it.current }),
    );
  }
  return JSON.stringify(out, null, 0);
})()

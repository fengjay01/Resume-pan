(async () => {
  const out = [];
  const mod = await import('/src/lib/resumeImport.ts');

  const fetchFile = async (url, name) => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name);
  };

  const show = (t) => t.split('\n').slice(0, 14).map((l, i) => '   ' + (i + 1) + '| ' + l).join('\n');

  /* ---------- ① 文本版 PDF：直接提取文字 ---------- */
  const f1 = await fetchFile('/fixtures/resume-text.pdf', 'resume-text.pdf');
  const r1 = await mod.readResumeFile(f1);
  out.push('① 文本版 PDF：needsOcr=' + !!r1.needsOcr + '，文本长度=' + r1.text.length);
  out.push(show(r1.text));

  const parsed = mod.parseResumeText(r1.text);
  out.push(
    '   识别模块：' +
      parsed.sections
        .map((s) => s.title + '(' + (s.kind === 'list' ? s.items.length + '条' : '富文本') + ')')
        .join('、'),
  );
  out.push('   基本信息：' + JSON.stringify(parsed.basic));
  parsed.sections
    .filter((s) => s.kind === 'list')
    .slice(0, 2)
    .forEach((s) => {
      const it = s.items[0] || {};
      out.push(
        '   ' + s.title + ' 首条 → ' +
          JSON.stringify({ name: it.name, role: it.role, start: it.startDate, end: it.endDate, current: it.current }),
      );
    });
  const edu = parsed.sections.find((s) => s.title.includes('教育'));
  if (edu && edu.items[0]) {
    out.push('   教育背景首条内容：' + (edu.items[0].content || '').slice(0, 120));
  }

  /* ---------- ② 图片版 PDF：应提示需要 OCR ---------- */
  const f2 = await fetchFile('/fixtures/resume-image.pdf', 'resume-image.pdf');
  const r2 = await mod.readResumeFile(f2);
  out.push('② 图片版 PDF：提取文本长度=' + r2.text.length + '，needsOcr=' + !!r2.needsOcr);
  out.push('   hint：' + r2.hint);

  return JSON.stringify(out, null, 0);
})()

/* 导出测试：一次跑齐两种模式，返回各自 PDF 的 base64 + 诊断信息
 * ① 浏览器导出（渲染服务 printToPDF，矢量无损）
 * ② 图片导出（服务 PDF → pdf.js 3x 栅格化 → jsPDF，兼容模式）
 */
(async () => {
  const toB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const root = Array.from(document.querySelectorAll('div')).find((d) => d.style.left === '-99999px');
  if (!root) return JSON.stringify({ error: 'NO_ROOT' });
  const store = (await import('/src/store/resumeStore.ts')).useResumeStore.getState();
  const resume = store.get(window.__RID || 'sample-resume');
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const out = { rid: resume.id, name: resume.name, pages: root.querySelectorAll('.resume-page').length };

  /* ---------- ① 浏览器导出：渲染服务 ---------- */
  try {
    const { buildPrintDocument } = await import('/src/lib/export.ts');
    const { encodeResumePayload } = await import('/src/lib/resumeEmbed.ts');
    const payload = await encodeResumePayload(resume);
    const html = buildPrintDocument(root, 'svc');
    const res = await fetch('http://127.0.0.1:8790/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, filename: 'svc', payload }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const buf = new Uint8Array(await res.arrayBuffer());
    out.service = { size: buf.length, b64: toB64(buf) };
  } catch (e) {
    out.service = { error: String(e).slice(0, 300) };
  }

  /* ---------- ② 图片导出：服务 PDF → 3x 栅格化 → jsPDF（复刻 exportResumePdf） ---------- */
  try {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
    const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
    const vecBytes = out.service && out.service.b64 ? Uint8Array.from(atob(out.service.b64), (c) => c.charCodeAt(0)) : null;
    if (!vecBytes) throw new Error('服务 PDF 不可用');
    const vec = await pdfjs.getDocument({ data: vecBytes.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
    const { encodeResumePayload } = await import('/src/lib/resumeEmbed.ts');
    const payload = await encodeResumePayload(resume);
    const { jsPDF } = await import('/node_modules/.vite/deps/jspdf.js');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    for (let i = 1; i <= vec.numPages; i += 1) {
      const page = await vec.getPage(i);
      const vp = page.getViewport({ scale: 3 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport: vp, background: '#ffffff' }).promise;
      if (i > 1) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    pdf.setProperties({ keywords: payload });
    const imgBytes = new Uint8Array(pdf.output('arraybuffer'));
    out.image = { size: imgBytes.length, b64: toB64(imgBytes) };
  } catch (e) {
    out.image = { error: String(e).slice(0, 300) };
  }

  return JSON.stringify({ rid: out.rid, name: out.name, pages: out.pages,
    service: out.service.error ? { error: out.service.error } : { size: out.service.size },
    image: out.image.error ? { error: out.image.error } : { size: out.image.size },
    serviceB64: out.service.b64, imageB64: out.image.b64,
  });
})()

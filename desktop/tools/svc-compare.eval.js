(async () => {
  const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
  const workerMod = await import('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const refs = window.__refs;
  const res = await fetch('/fixtures/svc-export.pdf');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 794 / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise;
    const refImg = new Image();
    await new Promise((res2, rej) => { refImg.onload = res2; refImg.onerror = rej; refImg.src = refs[p - 1]; });
    const W = Math.min(c.width, refImg.width); const H = Math.min(c.height, refImg.height);
    const a = c.getContext('2d').getImageData(0, 0, W, H).data;
    const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
    bc.getContext('2d').drawImage(refImg, 0, 0, W, H);
    const b = bc.getContext('2d').getImageData(0, 0, W, H).data;
    let hit = 0, miss = 0, extra = 0;
    for (let i = 0; i < W * H; i += 1) {
      const ia = a[i * 4] < 170 && a[i * 4 + 1] < 170 && a[i * 4 + 2] < 170;
      const ib = b[i * 4] < 170 && b[i * 4 + 1] < 170 && b[i * 4 + 2] < 170;
      if (ia && ib) hit += 1; else if (ib) miss += 1; else if (ia) extra += 1;
    }
    const tc = await page.getTextContent();
    out.push({ page: p, iou: Math.round((100 * hit / (hit + miss + extra || 1)) * 100) / 100, textChars: tc.items.reduce((n, i2) => n + i2.str.length, 0) });
  }
  return JSON.stringify({ pages: doc.numPages, results: out }, null, 1);
})()

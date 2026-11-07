/* 冒烟：验证 buildPrintDocument 输出结构（纯 JS，无 TS 标注） */
(async function () {
  var mod = await import('/src/lib/export.ts');
  var root = Array.from(document.querySelectorAll('div')).find(function (d) {
    return d.style.left === '-99999px';
  });
  if (!root) return 'NO_EXPORT_ROOT';
  var pageEls = root.querySelectorAll('.resume-page');
  var samplePageText = (pageEls[0] && pageEls[0].textContent || '').slice(0, 40);
  var html = mod.buildPrintDocument(root, 'test-title');
  return {
    "pagesInRoot": pageEls.length,
    "pageCountInDoc": (html.match(/class="resume-page"/g) || []).length,
    "hasBase": html.indexOf('<base href=') >= 0,
    "hasPageSize": html.indexOf('@page { size: 794px 1123px; margin: 0; }') >= 0,
    "hasColorAdjust": html.indexOf('print-color-adjust: exact !important') >= 0,
    "payloadCopies": html.split('PAYLOADTESTDATA123').length - 1,
    "measureRemoved": html.indexOf('overflow: hidden; visibility: hidden; pointer-events: none;') < 0,
    "noRgbaShadow": html.indexOf('box-shadow: rgba(16,24,40') < 0 && html.indexOf('box-shadow:0 1px 2px rgba(16,24,40') < 0,
    "hasStyles": html.indexOf('stylesheet') >= 0 || html.indexOf('<style') >= 0,
    "docLen": html.length,
    "firstPageText": samplePageText
  };
})()

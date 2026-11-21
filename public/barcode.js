/* Reading a barcode cleanly (20 Nov 2026). Every retail barcode carries a check digit; a camera read that does not add up is a
   misread, never a product. UPC-E (the short code on small US packs) is written out as the UPC-A it stands for. And the camera must
   see the same valid number twice before anything is looked up, so one shaky frame cannot send the wrong product.
   Used by the app (app.js) and by evals/barcode-audit.cjs, which runs this file in a browser. The Worker has the same rules. */
(function (g) {
  function sumOk(c) {
    if (!/^\d+$/.test(c) || [8, 12, 13, 14].indexOf(c.length) < 0) return false;
    var s = 0, n = c.length;
    for (var i = n - 2, k = 0; i >= 0; i--, k++) s += Number(c.charAt(i)) * (k % 2 ? 1 : 3);
    return (10 - (s % 10)) % 10 === Number(c.charAt(n - 1));
  }
  function upcE(c) {
    if (!/^0\d{7}$/.test(c)) return '';
    var d = c.slice(1, 7), l = d.charAt(5), m;
    if ('012'.indexOf(l) > -1) m = d.slice(0, 2) + l + '0000' + d.slice(2, 5);
    else if (l === '3') m = d.slice(0, 3) + '00000' + d.slice(3, 5);
    else if (l === '4') m = d.slice(0, 4) + '00000' + d.charAt(4);
    else m = d.slice(0, 5) + '0000' + l;
    return c.charAt(0) + m + c.charAt(7);
  }
  /* the number to look up, or '' when it cannot be a real barcode. format: what the camera says it read, when it says */
  function normal(raw, format) {
    var c = String(raw || '').replace(/\D/g, ''), f = String(format || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    /* UPC-E is only ever issued to company numbers that start with 0 (GS1's rule), so a "UPC-E" starting with 1 is a misread:
       a tilted EAN-13 can look like one. Readers give it as 8 digits, or written out as 12 or 13. */
    if (f === 'UPCE') {
      var e = c.length === 13 && c.charAt(0) === '0' ? c.slice(1) : c.length === 8 ? upcE(c) : c.length === 7 ? upcE('0' + c) : c;
      return e.length === 12 && e.charAt(0) === '0' && sumOk(e) ? e : '';
    }
    if (c.length === 13 && c.charAt(0) === '0' && f !== 'UPCE') c = c.slice(1); // an EAN-13 starting with 0 is a UPC-A; one form, always
    if (c.length === 8 && f !== 'EAN8' && !sumOk(c)) { var a = upcE(c); return a && sumOk(a) ? a : ''; }
    if ([8, 12, 13, 14].indexOf(c.length) > -1) return sumOk(c) ? c : '';
    return '';
  }
  /* digits that look like a barcode but do not add up (for a number someone typed) */
  function typedWrong(raw) { var c = String(raw || '').replace(/\D/g, ''); return [8, 12, 13, 14].indexOf(c.length) > -1 && !normal(c); }
  /* the camera's reads, frame by frame: a code is taken once the same valid number has been seen `need` times */
  function Steady(need) {
    var last = '', count = 0, n = need || 2;
    return {
      feed: function (raw, format) {
        var c = normal(raw, format);
        if (!c) return '';
        if (c === last) count++; else { last = c; count = 1; }
        return count >= n ? c : '';
      },
      seen: function () { return last; },
      reset: function () { last = ''; count = 0; },
    };
  }
  /* The reader. The phone's own barcode reader where it has one for shop barcodes (Android Chrome); everywhere else (iPhone,
     desktop) ZXing-C++ as WebAssembly from /vendor, loaded only when the barcode sheet first opens. The older reader
     (html5-qrcode) missed most barcodes printed on a coloured pack. Returns [{ text, format }]. */
  var FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'], native = null, zx = null;
  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  async function nativeReader() {
    if (native !== null) return native;
    native = false;
    try {
      if (g.BarcodeDetector && g.BarcodeDetector.getSupportedFormats) {
        var have = await g.BarcodeDetector.getSupportedFormats();
        if (FORMATS.every(function (f) { return have.indexOf(f) > -1; })) native = new g.BarcodeDetector({ formats: FORMATS });
      }
    } catch (e) { native = false; }
    return native;
  }
  async function zxing() {
    if (zx) return zx;
    if (!g.ZXingWASM) await loadScript('/vendor/zxing-reader.js');
    g.ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (p, prefix) { return p.endsWith('.wasm') ? '/vendor/' + p : prefix + p; } }, fireImmediately: true });
    zx = g.ZXingWASM;
    return zx;
  }
  async function read(canvas, opts) {
    var useNative = !(opts && opts.noNative) && (await nativeReader());
    if (useNative) {
      var found = await useNative.detect(canvas);
      return found.map(function (b) { return { text: b.rawValue, format: String(b.format || '').toUpperCase().replace('_', '') }; });
    }
    var z = await zxing();
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var r = await z.readBarcodes(img, { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'], tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 });
    return r.filter(function (b) { return b.isValid; }).map(function (b) { return { text: b.text, format: String(b.format || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }; });
  }
  g.StockerCode = { normal: normal, sumOk: sumOk, upcE: upcE, typedWrong: typedWrong, Steady: Steady, read: read, nativeReader: nativeReader };
})(typeof window !== 'undefined' ? window : globalThis);

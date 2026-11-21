// Makes the barcode test photos in evals/barcode-images: real-format product numbers (India 890, US UPC, EU EAN-13 and EAN-8,
// UPC-E), drawn by bwip-js, then damaged the way a phone camera sees a pack (blur, tilt, glare, dim kitchen light, a curved can,
// a crumpled bag, too far away, a thumb over the bars). The damage is done by scripts/barcode-damage.py.
// The numbers are made up with valid check digits; they are not taken from real packs.
//   node scripts/barcode-images.mjs && python3 scripts/barcode-damage.py
// A first-sight set, never tuned on: node scripts/barcode-images.mjs --set=fresh && python3 scripts/barcode-damage.py fresh
import fs from 'fs';
import bwipjs from 'bwip-js';
const FRESH = process.argv.includes('--set=fresh');
const OUT = new URL(FRESH ? '../evals/barcode-images-fresh/' : '../evals/barcode-images/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const check = (d) => { const s = d.split('').reverse().reduce((t, c, i) => t + Number(c) * (i % 2 ? 1 : 3), 0); return String((10 - (s % 10)) % 10); };
const CODES = [
  ['ean13', '890' + '1063' + '01234'], ['ean13', '890' + '2519' + '00412'], ['ean13', '890' + '0000' + '77031'], ['ean13', '890' + '4004' + '40046'],
  ['upca', '0' + '41196' + '91022'], ['upca', '0' + '38000' + '13858'], ['upca', '0' + '72250' + '01131'], ['upca', '8' + '52565' + '00321'],
  ['ean13', '400' + '6040' + '00012'], ['ean13', '501' + '0029' + '00076'], ['ean13', '471' + '0088' + '41205'], ['ean13', '880' + '1043' + '01534'],
  ['ean8', '9638' + '507'], ['ean8', '4007' + '630'], ['upce', '0' + '42410' + '0'], ['upce', '0' + '12345' + '0'],
];
// the fresh set: other numbers from the same kinds of prefix, drawn at another scale
if (FRESH) {
  let r = 7; const rnd = (n) => { r = (r * 1103515245 + 12345) % 2147483648; return String(Math.floor((r / 2147483648) * 10 ** n)).padStart(n, '0'); };
  CODES.length = 0;
  for (const pre of ['890', '890', '890', '890', '400', '500', '471', '880', '760', '930']) CODES.push(['ean13', pre + rnd(9)]);
  for (let i = 0; i < 4; i++) CODES.push(['upca', '0' + rnd(10)]);
  CODES.push(['ean8', rnd(7)], ['upce', '0' + rnd(5) + '5']);
}
const truth = [];
for (const [type, body] of CODES) {
  // UPC-E: the printed 8 digits are 0, six digits and the check digit of the UPC-A it stands for
  let full = body + check(body), text = full, bcid = type;
  if (type === 'upce') { const a = upcEtoA(body + 'X'); full = body + check(a.slice(0, 11)); text = full; }
  const png = await bwipjs.toBuffer({ bcid, text, scale: FRESH ? 2 : 3, height: FRESH ? 14 : 18, includetext: true, textxalign: 'center', paddingwidth: 14, paddingheight: 10, backgroundcolor: 'FFFFFF' });
  const name = type + '-' + full + '.png';
  fs.writeFileSync(new URL(name, OUT), png);
  truth.push({ file: name, type, code: full, gtin: type === 'upce' ? upcEtoA(full) : full });
}
fs.writeFileSync(new URL('clean.json', OUT), JSON.stringify(truth, null, 1));
console.log('barcodes drawn: ' + truth.length);
function upcEtoA(e) { // e: 8 digits (number system, six, check)
  const ns = e[0], d = e.slice(1, 7), ck = e[7], last = d[5];
  let m;
  if ('012'.includes(last)) m = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') m = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') m = d.slice(0, 4) + '00000' + d[4];
  else m = d.slice(0, 5) + '0000' + last;
  return ns + m + ck;
}

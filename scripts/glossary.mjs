// Copies src/grocery-data.txt into src/index.js between the GROCERY markers, so the Worker carries it with no imports.
// Edit the .txt, then run: npm run glossary
import fs from 'fs';
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const txt = fs.readFileSync(ROOT + 'src/grocery-data.txt', 'utf8');
if (/[`$\\]/.test(txt)) throw new Error('grocery-data.txt may not contain backticks, $ or backslashes');
const src = fs.readFileSync(ROOT + 'src/index.js', 'utf8');
const a = src.indexOf('// GROCERY-START'), b = src.indexOf('// GROCERY-END');
if (a < 0 || b < 0) throw new Error('markers missing in src/index.js');
const out = src.slice(0, a) + '// GROCERY-START (generated from src/grocery-data.txt by npm run glossary; do not edit here)\nconst GROCERY_TXT = `' + txt + '`;\n' + src.slice(b);
fs.writeFileSync(ROOT + 'src/index.js', out);
console.log('glossary: ' + txt.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length + ' items written into src/index.js');

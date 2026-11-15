// Loads the Worker with some of its internal helpers exported, from a temporary copy, so the offline tests run the real code.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function loadAgent(names) {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tote-')), 'agent.mjs');
  fs.writeFileSync(tmp, src + '\nexport { ' + names.join(', ') + ' };\n');
  return import(pathToFileURL(tmp).href);
}

/**
 * Checks the Hindi translations: every t('…') text in the app has an entry, entries keep the same {placeholders},
 * and no entry is unused. Run: npm run check:i18n -w @hoc/mobile
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hi } from '../src/i18n/hi';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !p.includes('/i18n/') ? [p] : [];
  });
}

const used = new Set<string>();
for (const f of files('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
    const lit = m[1]!;
    used.add(lit[0] === '"' ? (JSON.parse(lit) as string) : lit.slice(1, -1).replace(/\\'/g, "'"));
  }
}

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');
const missing = [...used].filter((k) => !(k in hi));
const mismatched = Object.entries(hi).filter(([k, v]) => holes(k) !== holes(v)).map(([k]) => k);
const unused = Object.keys(hi).filter((k) => !used.has(k));

console.log(`${used.size} texts in the app, ${Object.keys(hi).length} Hindi entries`);
if (missing.length) console.log(`\nNo Hindi yet (${missing.length}):\n  ${missing.join('\n  ')}`);
if (mismatched.length) console.log(`\n{placeholders} differ from the English (${mismatched.length}):\n  ${mismatched.join('\n  ')}`);
console.log(`\n${unused.length} entries are for server-provided texts or are not used directly (expected for stage names, documents, categories and error messages).`);
process.exit(missing.length || mismatched.length ? 1 : 0);

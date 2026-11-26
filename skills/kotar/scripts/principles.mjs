// The laws, theories and hypotheses of a subject, kept in its area note (`## Principles` / `## İlkeler`), one line each:
//   - law: <statement> (source: ...)                  must hold; breaking one sends the work back
//   - theory: <statement> (evidence: BUG-012, ...)     guides the approach; a deviation needs a reason
//   - hypothesis: <statement> (for: ENH-3; against: )  unproven; each task that touches it adds evidence
// (Turkish boards may write yasa / teori / hipotez.)
// Usage: node principles.mjs <areas folder> [area...]   the principles of these areas (all areas when none), for a brief
//        node principles.mjs <areas folder> --status    every hypothesis with its evidence, and which to promote or drop
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KIND = { law: 'law', yasa: 'law', theory: 'theory', teori: 'theory', hypothesis: 'hypothesis', hipotez: 'hypothesis' };
const ids = (s) => (s || '').match(/\b(?:BUG|ENH|EXP)-\d+\b/g) || [];

export function parse(md) {
  const sec = md.split(/^## (?:Principles|İlkeler|Ilkeler)\s*$/m)[1]?.split(/^## /m)[0] || '';
  return sec.replace(/<!--[\s\S]*?-->/g, '').split('\n').flatMap((l) => {
    const m = l.match(/^\s*-\s*(law|yasa|theory|teori|hypothesis|hipotez)\s*:\s*(.+)$/i);
    if (!m) return [];
    const text = m[2].trim();
    return [{ kind: KIND[m[1].toLowerCase()], text, for: ids(text.match(/\b(?:for|lehine)\s*:([^;)]*)/i)?.[1]), against: ids(text.match(/\b(?:against|aleyhine)\s*:([^;)]*)/i)?.[1]) }];
  });
}

// A hypothesis with 3+ supporting notes and none against is ready to become a theory; any against makes it a drop candidate.
export const verdict = (p) => (p.kind !== 'hypothesis' ? '' : p.against.length ? 'drop?' : p.for.length >= 3 ? 'promote?' : 'open');

function main([dir, ...rest]) {
  if (!dir || !fs.existsSync(dir)) throw new Error('usage: node principles.mjs <areas folder> [area...] [--status]');
  const status = rest.includes('--status');
  const wanted = rest.filter((a) => a !== '--status').map((a) => a.replace(/^\[\[|\]\]$/g, '').toLowerCase());
  const areas = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
    .filter((a) => !wanted.length || wanted.includes(a.toLowerCase()));
  const out = [];
  for (const a of areas) {
    const list = parse(fs.readFileSync(path.join(dir, `${a}.md`), 'utf8'));
    const shown = status ? list.filter((p) => p.kind === 'hypothesis') : list;
    if (!shown.length) continue;
    out.push(`${a}:`);
    for (const p of shown) out.push(`  ${p.kind}: ${p.text}${status ? `  [${verdict(p)}: ${p.for.length} for, ${p.against.length} against]` : ''}`);
  }
  console.log(out.length ? out.join('\n') : `No ${status ? 'hypotheses' : 'principles'} in ${wanted.length ? wanted.join(', ') : 'any area'} (add them under "## Principles" in the area note).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

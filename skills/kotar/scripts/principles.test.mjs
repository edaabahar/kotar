// node skills/kotar/scripts/principles.test.mjs
import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { parse, verdict } from './principles.mjs';

const md = `# Pipeline
Paths: \`backend/\`

## İlkeler
<!-- - law: an example in a comment is not a principle -->
- yasa: piksel sanatı tam hücre, en yakın komşu (kaynak: CLAUDE.md)
- theory: the model follows the prompt body over a closing sentence (evidence: BUG-016, BUG-019)
- hipotez: kafa kutusu mankenden gelirse tüm açılarda oran ±%10 kalır (lehine: BUG-021, BUG-026, EXP-046; aleyhine: )
- hypothesis: a bigger palette keeps face detail (for: BUG-024; against: BUG-027)
- just a note line, not a principle

## Notes
- law: outside the section, ignored
`;
const ps = parse(md);
assert.deepEqual(ps.map((p) => p.kind), ['law', 'theory', 'hypothesis', 'hypothesis']);
assert.deepEqual(ps[2].for, ['BUG-021', 'BUG-026', 'EXP-046']);
assert.deepEqual(ps.map(verdict), ['', '', 'promote?', 'drop?']);
assert.equal(verdict({ kind: 'hypothesis', for: ['BUG-1'], against: [] }), 'open');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotar-principles-'));
fs.writeFileSync(path.join(dir, 'Pipeline.md'), md);
fs.writeFileSync(path.join(dir, 'Site.md'), '# Site\n');
const run = (...a) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'principles.mjs'), dir, ...a], { encoding: 'utf8' }).stdout;
assert.match(run('[[Pipeline]]'), /^Pipeline:\n {2}law: piksel sanatı/m);
assert.doesNotMatch(run('Pipeline'), /outside the section|example in a comment/);
assert.match(run('Site'), /No principles in site/);
assert.match(run('--status'), /promote\?: 3 for, 0 against[\s\S]*drop\?: 1 for, 1 against/);
assert.doesNotMatch(run('--status'), /law:/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('principles tests passed');

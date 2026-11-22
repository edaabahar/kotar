// Self-check: node review.test.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import assert from 'assert';
import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'a.txt'), '1');
git('add', '.'); git('commit', '-qm', 'init');
git('checkout', '-qb', 'work');
fs.mkdirSync(path.join(repo, 'src'));
fs.writeFileSync(path.join(repo, 'src', 'x.js'), 'x'); // planned (inside src/)
fs.writeFileSync(path.join(repo, 'extra.js'), 'y'); // not planned
git('add', '.'); git('commit', '-qm', 'work');

const note = path.join(repo, 'note.md');
const started = new Date(Date.now() - 90 * 60000).toISOString();
fs.writeFileSync(note, `---\nsize: S\nstarted: ${started}\nnudges: 2\nretries: 0\n---\n# BUG-001 t\n\n## Files\n- \`src/\`\n- \`lib/unused.js\`\n\n## Plan\nx\n`);

const out = JSON.parse(execFileSync('node', [fileURLToPath(new URL('review.mjs', import.meta.url)), note, 'work', repo], { encoding: 'utf8' }));
assert.equal(out.commits, 1);
assert.deepEqual(out.outside, ['extra.js']);
assert.deepEqual(out.untouched, ['lib/unused.js']);
assert.deepEqual(out.flags, ['slow', 'scope-drift', 'stalled']);
assert.equal(out.budget, 20);
fs.rmSync(repo, { recursive: true, force: true });
console.log('review ok');

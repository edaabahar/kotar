// node skills/kotar/scripts/checks.test.mjs
import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { globRe, parseChecks } from './checks.mjs';

assert.ok(globRe('src/**/*.gd').test('src/a/b.gd'));
assert.ok(globRe('src/**/*.gd').test('src/b.gd'));
assert.ok(!globRe('src/*.gd').test('src/a/b.gd'));
assert.ok(globRe('*.md').test('x.md') && !globRe('*.md').test('d/x.md'));

const md = `## Checks
| Check | Mode | Files | Budget | Command |
|---|---|---|---|---|
| ok | block | src/** | 20 | \`node -e "process.exit(0)" {files}\` |
| bad | block | src/** | 20 | node -e "process.exit(2)" |
| meh | warn | src/** | 20 | node -e "console.log('lint: 1 issue');process.exit(1)" |
| slow | block | src/** | 1 | node -e "setTimeout(()=>{},5000)" |
| skipme | block | src/** | 20 | node -e "process.exit(1)" |
| docs | block | docs/** | 20 | node -e "process.exit(1)" |

## Merge
`;
const rows = parseChecks(md);
assert.deepEqual(rows.map((r) => r.name), ['ok', 'bad', 'meh', 'slow', 'skipme', 'docs']);
assert.equal(rows[0].command, 'node -e "process.exit(0)" {files}');
assert.equal(rows[2].mode, 'warn');
const template = fs.readFileSync(path.join(import.meta.dirname, '../../../templates/kotar.md'), 'utf8');
assert.deepEqual(parseChecks(template), [], 'example rows in the template comment are not checks');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotar-checks-'));
const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
fs.mkdirSync(path.join(dir, '.claude'));
fs.writeFileSync(path.join(dir, '.claude/kotar.md'), md);
git('add', '-A');
git('commit', '-qm', 'base');
git('checkout', '-qb', 'work');
fs.mkdirSync(path.join(dir, 'src'));
fs.writeFileSync(path.join(dir, 'src/a.js'), 'x\n');

const script = path.join(import.meta.dirname, 'checks.mjs');
const r = spawnSync(process.execPath, [script, '--note', 'BUG-009', '--skip', 'skipme=flaky on CI'], { cwd: dir, encoding: 'utf8' });
const out = r.stdout;
assert.equal(r.status, 1, 'a failed block check fails the run');
assert.match(out, /scope: 1 changed/);
assert.match(out, /PASS {2}ok/);
assert.match(out, /FAIL {2}bad/);
assert.match(out, /WARN {2}meh[\s\S]*lint: 1 issue/);
assert.match(out, /SLOW {2}slow/);
assert.match(out, /SKIP {2}skipme: flaky on CI/);
assert.match(out, /n\/a {3}docs/);

const log = fs.readFileSync(path.join(dir, '.git/kotar/audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
assert.deepEqual(log.map((l) => `${l.check}:${l.status}`).sort(), ['meh:warn-failed', 'skipme:skipped', 'slow:timeout']);
assert.ok(log.every((l) => l.branch === 'work' && l.note === 'BUG-009'));
assert.equal(log.find((l) => l.check === 'skipme').reason, 'flaky on CI');

const clean = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, KOTAR_CONFIG: path.join(dir, 'none.md') } });
assert.equal(clean.status, 0);
assert.match(clean.stdout, /nothing to run/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('checks tests passed');

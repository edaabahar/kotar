// node skills/cleanup/scripts/worktrees.test.mjs
import assert from 'assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { worktrees, remove } from './worktrees.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kotar-wt-'));
const repo = path.join(root, 'repo');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
fs.mkdirSync(repo);
g(repo, 'init', '-q', '-b', 'main');
g(repo, 'config', 'user.email', 't@t'); g(repo, 'config', 'user.name', 't');
fs.writeFileSync(path.join(repo, '.gitignore'), 'logs/\nnode_modules/\n');
fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
g(repo, 'add', '.'); g(repo, 'commit', '-qm', 'init');
const wt = (name) => { const p = path.join(root, name); g(repo, 'worktree', 'add', '-q', p, '-b', name); return p; };

const merged = wt('merged');
fs.mkdirSync(path.join(merged, 'node_modules')); fs.writeFileSync(path.join(merged, 'node_modules/x'), 'x');
const ahead = wt('ahead');
fs.writeFileSync(path.join(ahead, 'b.txt'), 'b'); g(ahead, 'add', '.'); g(ahead, 'commit', '-qm', 'b');
const dirty = wt('dirty');
fs.writeFileSync(path.join(dirty, 'c.txt'), 'c');
const data = wt('data');
fs.mkdirSync(path.join(data, 'logs')); fs.writeFileSync(path.join(data, 'logs/run.jsonl'), '{}');
const gone = wt('gone');
fs.rmSync(gone, { recursive: true, force: true });

const state = Object.fromEntries(worktrees(repo).rows.map((r) => [r.branch, r]));
assert.equal(state.merged.state, 'merged');
assert.deepEqual(state.merged.ignored, []); // node_modules is rebuildable
assert.equal(state.ahead.state, 'unmerged');
assert.equal(state.dirty.state, 'dirty');
assert.deepEqual(state.data.ignored, ['logs/']);
assert.equal(state.gone.state, 'missing');

const branches = () => g(repo, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean).sort();
const st = (rs) => rs.map((r) => r.status);

// Without flags only the merged, clean one and the missing one go.
assert.deepEqual(st(remove(repo, [merged, ahead, dirty, data, gone])), ['removed', 'skipped', 'skipped', 'skipped', 'removed']);
assert.ok(!fs.existsSync(merged));
assert.deepEqual(branches(), ['ahead', 'data', 'dirty', 'main']);

// --unmerged removes the worktree but keeps its branch and commits.
const [a] = remove(repo, [ahead], { unmerged: true });
assert.equal(a.status, 'removed'); assert.match(a.note, /branch kept: 1 commits/);
assert.ok(branches().includes('ahead'));

// --wip saves uncommitted changes as a commit on the branch first.
const [d] = remove(repo, [dirty], { wip: true });
assert.equal(d.status, 'removed');
assert.match(g(repo, 'show', '--stat', 'dirty'), /c\.txt/);

// Ignored data needs --drop-ignored.
assert.equal(remove(repo, [data], { dropIgnored: true })[0].status, 'removed');
assert.deepEqual(branches(), ['ahead', 'dirty', 'main']);
assert.equal(worktrees(repo).rows.length, 0);

fs.rmSync(root, { recursive: true, force: true });
console.log('worktrees ok');

// List a repo's worktrees and remove them safely. Run from any checkout of the repo.
//   node worktrees.mjs [--main <branch>] list [--json]
//   node worktrees.mjs [--main <branch>] remove [--unmerged] [--wip] [--drop-ignored] <path...>
// list states: missing (folder gone), merged (nothing off main, clean), unmerged (commits off main), dirty (uncommitted).
// remove never forces: a dirty worktree needs --wip (its changes become a WIP commit on its branch), one with commits
// off main needs --unmerged, one holding ignored data that is not rebuildable needs --drop-ignored. A merged branch is
// deleted with it; any other branch is kept, so no commit is lost.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Ignored paths that a build or install makes again; anything else ignored (logs, outputs, presets) is data.
const REBUILDABLE = /(^|\/)(node_modules|__pycache__|\.godot|\.pytest_cache|\.venv|venv|dist|build|\.next|\.cache|model-cache)(\/|$)|(^|\/)\.env[^/]*$|\.lock$/;

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

export function worktrees(cwd, main = 'main') {
  const list = git(cwd, 'worktree', 'list', '--porcelain');
  if (!list.ok) throw new Error(list.err || 'not a git repo');
  const rows = [];
  let cur = null;
  for (const line of list.out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) rows.push((cur = { path: line.slice(9) }));
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'detached') cur.branch = null;
  }
  const [top, ...rest] = rows;
  return {
    top: top.path,
    rows: rest.map((w) => {
      if (!fs.existsSync(w.path)) return { ...w, state: 'missing', ahead: 0, dirty: 0, ignored: [] };
      const ahead = w.branch ? Number(git(top.path, 'rev-list', '--count', `${main}..refs/heads/${w.branch}`).out || 0) : 0;
      const st = git(w.path, 'status', '--porcelain', '--ignored').out.split(/\r?\n/).filter(Boolean);
      const dirty = st.filter((l) => !l.startsWith('!!')).length;
      const ignored = st.filter((l) => l.startsWith('!!')).map((l) => l.slice(3)).filter((p) => !REBUILDABLE.test(p));
      return { ...w, state: dirty ? 'dirty' : ahead ? 'unmerged' : 'merged', ahead, dirty, ignored };
    }),
  };
}

export function remove(cwd, paths, { main = 'main', unmerged = false, wip = false, dropIgnored = false } = {}) {
  const { top, rows } = worktrees(cwd, main);
  const results = [];
  for (const p of paths) {
    const w = rows.find((r) => norm(r.path) === norm(p));
    const say = (status, note = '') => results.push({ path: p, branch: w?.branch ?? null, status, note });
    if (!w) { say('skipped', 'not a worktree of this repo'); continue; }
    if (w.state === 'missing') git(top, 'worktree', 'prune');
    else {
      if (w.dirty && !wip) { say('skipped', `${w.dirty} uncommitted changes (use --wip)`); continue; }
      if (w.ahead && !unmerged && !wip) { say('skipped', `${w.ahead} commits not on ${main} (use --unmerged)`); continue; }
      if (w.ignored.length && !dropIgnored) { say('skipped', `ignored data: ${w.ignored.slice(0, 4).join(', ')} (use --drop-ignored)`); continue; }
      if (w.dirty) {
        const add = git(w.path, 'add', '-A');
        const c = add.ok && git(w.path, 'commit', '-q', '-m', 'WIP: saved by kotar cleanup before removing the worktree');
        if (!c || !c.ok) { say('skipped', `WIP commit failed: ${(c || add).err.split('\n')[0]}`); continue; }
      }
      const rm = git(top, 'worktree', 'remove', w.path);
      if (!rm.ok) {
        // Windows: git unregisters the worktree, then cannot delete a file a process still holds.
        const still = git(top, 'worktree', 'list', '--porcelain').out.split(/\r?\n/).some((l) => norm(l.slice(9)) === norm(w.path));
        if (still) { say('failed', rm.err.split('\n')[0]); continue; }
        w.leftFolder = true;
      }
    }
    let note = w.leftFolder ? 'folder left behind (a file is in use); delete it later' : '';
    if (w.branch) {
      const off = Number(git(top, 'rev-list', '--count', `${main}..refs/heads/${w.branch}`).out || 0);
      if (off === 0) git(top, 'branch', '-d', w.branch);
      else note = [note, `branch kept: ${off} commits not on ${main}`].filter(Boolean).join('; ');
    }
    say('removed', note);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (f) => { const i = args.indexOf(f); return i >= 0 && args.splice(i, 1).length > 0; };
  let main = 'main';
  const mi = args.indexOf('--main');
  if (mi >= 0) main = args.splice(mi, 2)[1];
  const cmd = args.shift();
  if (cmd === 'list') {
    const json = flag('--json');
    const { rows } = worktrees(process.cwd(), main);
    if (json) console.log(JSON.stringify(rows, null, 1));
    else for (const r of rows) console.log([r.state, r.ahead, r.dirty, r.ignored.join(',') || '-', r.branch || '(detached)', r.path].join('\t'));
  } else if (cmd === 'remove') {
    const opts = { main, unmerged: flag('--unmerged'), wip: flag('--wip'), dropIgnored: flag('--drop-ignored') };
    const res = remove(process.cwd(), args, opts);
    for (const r of res) console.log([r.status, r.branch || '-', r.path, r.note].join('\t'));
    if (res.some((r) => r.status === 'failed')) process.exitCode = 1;
  } else {
    console.error('usage: worktrees.mjs [--main <branch>] list [--json] | remove [--unmerged] [--wip] [--drop-ignored] <path...>');
    process.exitCode = 2;
  }
}

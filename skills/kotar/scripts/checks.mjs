// Micro checks for one branch: runs the project's "## Checks" rows (.claude/kotar.md) only on what the change touches,
// the changed files plus the files that use them (code graph, one level), each within its time budget.
// Usage (cwd: the branch's worktree): node checks.mjs [--base main] [--note BUG-001] [--skip <check>=<reason>]...
// Prints one line per check; exits 1 when a `block` check fails. Skipped, timed-out and failed `warn` checks are
// appended to <git common dir>/kotar/audit.jsonl: never read into a brief, only when someone asks what was skipped.
import fs from 'fs';
import path from 'path';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const base = opt('--base') || 'main';
const noteId = opt('--note') || '';
const skips = Object.fromEntries(argv.flatMap((a, i) => (a === '--skip' ? [argv[i + 1].split(/=(.*)/s).slice(0, 2)] : [])));

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const root = git('rev-parse', '--show-toplevel');

// "| Check | Mode | Files | Budget | Command |" rows; Files is a comma list of globs, Budget in seconds.
export function parseChecks(md) {
  const section = md.split(/^## Checks\s*$/m)[1]?.split(/^## /m)[0] || '';
  const body = section.replace(/<!--[\s\S]*?-->/g, ''); // the template's example rows live in a comment
  return body.split('\n')
    .filter((l) => /^\|/.test(l.trim()))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`|`$/g, '')))
    .filter((c) => c.length >= 5 && !/^-+$/.test(c[0]) && c[0].toLowerCase() !== 'check')
    .map(([name, mode, files, budget, ...cmd]) => ({
      name, mode: mode.toLowerCase() === 'block' ? 'block' : 'warn',
      globs: files.split(',').map((g) => g.trim()).filter(Boolean), budget: Number(budget) || 60, command: cmd.join('|'),
    }));
}

// shortcut: ** / * / ? globs only (no braces or classes), enough for path filters; use path.matchesGlob once it is stable.
export const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*')
  .replace(/\?/g, '[^/]').replace(/\0/g, '.*') + '$');

function scope() {
  const fork = git('merge-base', base, 'HEAD');
  const changed = [...new Set([...git('diff', '--name-only', fork).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')])]
    .filter((f) => f && fs.existsSync(path.join(root, f)));
  return { changed, users: [] };
}

async function withUsers(s) {
  try {
    const graph = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../graph/queries.mjs');
    process.env.KOTAR_ROOT ||= root;
    const { dependents } = await import(pathToFileURL(graph).href);
    s.users = dependents(s.changed).filter((f) => fs.existsSync(path.join(root, f)));
  } catch { /* no code graph for this project: changed files only */ }
  return s;
}

// Runs a shell command; past the budget the whole process tree is killed (a test may start a game binary).
function run(cmd, budget) {
  return new Promise((done) => {
    const p = spawn(cmd, { cwd: root, shell: true, detached: process.platform !== 'win32' });
    let stdout = '', stderr = '', timedOut = false;
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else try { process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, budget * 1000);
    p.on('close', (status) => (clearTimeout(timer), done({ status, stdout, stderr, timedOut })));
  });
}

function audit(rec) {
  const dir = path.join(path.resolve(root, git('rev-parse', '--git-common-dir')), 'kotar');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), branch: git('branch', '--show-current'), note: noteId, ...rec }) + '\n');
}

async function main() {
  const cfg = process.env.KOTAR_CONFIG || path.join(root, '.claude/kotar.md'); // KOTAR_CONFIG: tests
  const checks = parseChecks(fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '');
  if (!checks.length) return console.log('No "## Checks" rows in .claude/kotar.md: nothing to run.');
  const s = await withUsers(scope());
  console.log(`scope: ${s.changed.length} changed, ${s.users.length} users of them`);
  let blocked = false;
  for (const c of checks) {
    const files = [...s.changed, ...s.users].filter((f) => c.globs.some((g) => globRe(g).test(f)));
    const rec = { check: c.name, mode: c.mode, files: files.length };
    if (!files.length) { console.log(`n/a   ${c.name} (no matching file)`); continue; }
    if (c.name in skips) {
      audit({ ...rec, status: 'skipped', reason: skips[c.name] || 'no reason given' });
      console.log(`SKIP  ${c.name}: ${skips[c.name] || 'no reason given'}`);
      continue;
    }
    const cmd = c.command.includes('{files}') ? c.command.replaceAll('{files}', files.map((f) => `"${f}"`).join(' ')) : c.command;
    const t0 = Date.now();
    const r = await run(cmd, c.budget);
    const sec = Math.round((Date.now() - t0) / 100) / 10;
    if (r.timedOut) {
      audit({ ...rec, status: 'timeout', seconds: sec, reason: `over the ${c.budget}s budget` });
      console.log(`SLOW  ${c.name}: stopped at ${c.budget}s budget (not verified; the check is too big for a micro task)`);
      continue;
    }
    if (r.status === 0) { console.log(`PASS  ${c.name} (${sec}s, ${files.length} files)`); continue; }
    const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
    if (c.mode === 'block') blocked = true;
    else audit({ ...rec, status: 'warn-failed', seconds: sec, reason: tail.split('\n').at(-1)?.slice(0, 200) || `exit ${r.status}` });
    console.log(`${c.mode === 'block' ? 'FAIL ' : 'WARN '} ${c.name} (${sec}s, exit ${r.status})\n${tail.replace(/^/gm, '      ')}`);
  }
  process.exit(blocked ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

// Facts for a task's post-merge review: how long it took, whether it stayed inside its plan.
// Usage: node review.mjs <note.md> <branch> [repo dir]   (run from the main checkout, before merging)
// Prints JSON: { minutes, budget, commits, planned, touched, outside, untouched, flags }
import fs from 'fs';
import { execFileSync } from 'child_process';

const [notePath, branch, repo = '.'] = process.argv.slice(2);
if (!notePath || !branch) throw new Error('usage: node review.mjs <note.md> <branch> [repo dir]');

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const note = fs.readFileSync(notePath, 'utf8');
const field = (k) => note.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm'))?.[1].trim() ?? '';
const section = (name) => note.split(/^## /m).find((s) => s.startsWith(name))?.slice(name.length) ?? '';

const BUDGET = { S: 20, M: 60, L: 120 }; // shortcut: fixed minutes per size, tune from the board's own history once there is some
const size = field('size').toUpperCase() || 'M';
const ref = `refs/heads/${branch}`;
const started = Date.parse(field('started'));
const finished = Date.parse(git('log', '-1', '--format=%cI', ref));
const minutes = Number.isNaN(started) ? null : Math.max(0, Math.round((finished - started) / 60000));

const planned = [...section('Files').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const touched = git('diff', '--name-only', `main...${ref}`).split('\n').filter(Boolean);
const inPlan = (file) => planned.some((p) => file === p || file.startsWith(p.replace(/\/?$/, '/')));
const outside = touched.filter((f) => !inPlan(f) && !f.startsWith('docs/'));
const untouched = planned.filter((p) => !touched.some((f) => f === p || f.startsWith(p.replace(/\/?$/, '/'))));

const flags = [];
if (minutes !== null && minutes > (BUDGET[size] ?? BUDGET.M)) flags.push('slow');
if (outside.length) flags.push('scope-drift');
if (planned.length && untouched.length === planned.length) flags.push('plan-missed');
if (Number(field('nudges')) >= 2) flags.push('stalled');
if (Number(field('retries')) >= 1) flags.push('merge-retried');

console.log(JSON.stringify({
  minutes,
  budget: BUDGET[size] ?? BUDGET.M,
  commits: Number(git('rev-list', '--count', `main..${ref}`)),
  planned,
  touched,
  outside,
  untouched,
  flags,
}, null, 2));

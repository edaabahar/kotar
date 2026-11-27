// Rebuilds the open/done lists in Bug Board.md, Enhancement Board.md and Experiment Board.md and the Board.canvas overview
// from each note's `status`. Run after creating a note or changing a `status`.
// Usage: node board_lists.mjs <board dir> [vault root]   (vault root defaults to the board dir;
// canvas file paths are relative to it, which is what Obsidian expects)
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.argv[2] ?? process.env.BOARD_DIR ?? '');
if (!process.argv[2] && !process.env.BOARD_DIR) throw new Error('usage: node board_lists.mjs <board dir> [vault root]');
const VAULT = path.resolve(process.argv[3] ?? ROOT);
const PREFIX = path.relative(VAULT, ROOT).split(path.sep).filter(Boolean).map((p) => p + '/').join('');
const BOARDS = [
  { dir: 'Bugs', board: 'Bug Board.md', open: 'Open bugs', done: 'Done bugs' },
  { dir: 'Enhancements', board: 'Enhancement Board.md', open: "Open enhancements", done: "Done enhancements" },
  { dir: 'Experiments', board: 'Experiment Board.md', open: 'Open experiments', done: 'Done experiments' },
];
const COLOR = { stuck: '1', queued: '2', new: '3', 'merge-pending': '5', running: '6' };
const W = 320, H = 70, GAP = 20, COLS = 3, PAD = 40;
const canvas = { nodes: [], edges: [] };
let x = 0;

const notes = (dir) => fs.readdirSync(`${ROOT}/${dir}`).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const t = fs.readFileSync(`${ROOT}/${dir}/${f}`, 'utf8');
  const status = t.match(/^status:\s*(\S+)/m), title = t.match(/^# \S+ (.*)$/m);
  if (!status || !title) throw new Error(`${dir}/${f}: missing "status:" or "# ID title" line`);
  const needs = (t.match(/^needs:\s*\[([^\]]*)\]/m)?.[1] ?? '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const flags = [...needs.map((r) => `needs ${r}`), ...(/^exclusive:\s*true\b/m.test(t) ? ['runs alone'] : [])];
  const waiting = t.match(/^waiting:\s*(\S+)/m)?.[1];
  if (waiting) flags.push(`waiting since ${waiting.slice(0, 16).replace('T', ' ')}`);
  return { dir, file: f, link: f.slice(0, -3), status: status[1], title: title[1], flags };
});

const addGroup = (label, items, color) => {
  const rows = Math.max(1, Math.ceil(items.length / COLS));
  const width = COLS * W + (COLS - 1) * GAP + 2 * PAD;
  canvas.nodes.push({ id: label, type: 'group', label: `${label} (${items.length})`, color, x, y: 0, width, height: rows * (H + GAP) - GAP + 2 * PAD });
  items.forEach((n, i) => canvas.nodes.push({
    id: n.link, type: 'file', file: `${PREFIX}${n.dir}/${n.file}`,
    x: x + PAD + (i % COLS) * (W + GAP), y: PAD + Math.floor(i / COLS) * (H + GAP), width: W, height: H,
    ...(COLOR[n.status] && { color: COLOR[n.status] }),
  }));
  x += width + 2 * PAD;
};

for (const b of BOARDS) {
  const boardPath = `${ROOT}/${b.board}`;
  if (!fs.existsSync(`${ROOT}/${b.dir}`) || !fs.existsSync(boardPath)) continue; // a project may have only one board
  const all = notes(b.dir);
  const open = all.filter((n) => n.status !== 'done'), done = all.filter((n) => n.status === 'done');
  const line = (n) => `- [[${n.link}|${n.link.split(' ')[0]}]] ${n.title}` + (n.status === 'done' ? '' : ` · \`${n.status}\`` + n.flags.map((x) => ` · ${x}`).join(''));
  const block = `## ${b.open} (${open.length})\n${open.map(line).join('\n') || '- yok'}\n\n## ${b.done} (${done.length})\n${done.map(line).join('\n')}\n\n`;
  const text = fs.readFileSync(boardPath, 'utf8')
    .replace(new RegExp(`## ${b.open} \\(\\d+\\)[\\s\\S]*?## ${b.done} \\(\\d+\\)[\\s\\S]*?\\n\\n(?=## )`), '')
    .replace('## How to steer', `${block}## How to steer`);
  fs.writeFileSync(boardPath, text);
  addGroup(b.open, open, '1');
  addGroup(b.done, done, '4');
}
fs.writeFileSync(`${ROOT}/Board.canvas`, JSON.stringify(canvas, null, 2));

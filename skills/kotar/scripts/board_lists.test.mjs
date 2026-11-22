// Self-check: node board_lists.test.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import assert from 'assert';
import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'board-')), root = path.join(vault, 'Proj');
fs.mkdirSync(path.join(root, 'Bugs'), { recursive: true });
fs.writeFileSync(path.join(root, 'Bug Board.md'), '# Board\n\n## How to steer\n- x\n');
fs.writeFileSync(path.join(root, 'Bugs', 'BUG-001 a.md'), '---\nstatus: running\n---\n# BUG-001 First\n');
fs.writeFileSync(path.join(root, 'Bugs', 'BUG-002 b.md'), '---\nstatus: done\n---\n# BUG-002 Second\n');
const run = () => execFileSync('node', [fileURLToPath(new URL('board_lists.mjs', import.meta.url)), root, vault]);
run(); run(); // twice: lists must be replaced, not duplicated
const board = fs.readFileSync(path.join(root, 'Bug Board.md'), 'utf8');
assert.equal(board.match(/## Open bugs \(1\)/g).length, 1);
assert.match(board, /\[\[BUG-001 a\|BUG-001\]\] First · `running`/);
assert.match(board, /## Done bugs \(1\)\n- \[\[BUG-002 b\|BUG-002\]\] Second\n/);
const canvas = JSON.parse(fs.readFileSync(path.join(root, 'Board.canvas'), 'utf8'));
assert.ok(canvas.nodes.some((n) => n.file === 'Proj/Bugs/BUG-001 a.md' && n.color === '6'));
fs.rmSync(vault, { recursive: true });
console.log('board_lists ok');

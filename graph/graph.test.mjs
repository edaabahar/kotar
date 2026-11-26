// node graph/graph.test.mjs — builds a tiny GDScript repo in a temp folder and checks config, queries and notes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kotar-graph-"));
const put = (f, t) => (fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }), fs.writeFileSync(path.join(dir, f), t));
put(".claude/kotar.md", "## Board\n- Board folder: `vault`\n\n## Code graph\n- Languages: `gdscript`  <!-- comment -->\n- Skip: addons/\n- Tests: test/\n");
put("project.godot", "[autoload]\nBus=\"*res://bus.gd\"\n");
put("bus.gd", "extends Node\nsignal changed\nfunc ping(n: int) -> void:\n\tchanged.emit()\n");
put("box.gd", "class_name Box\nextends Node\n## Draws the box.\nfunc draw_it() -> void:\n\tBus.ping(1)\n");
put("test/box_test.gd", "extends Node\nfunc test_it() -> void:\n\tvar b := Box.new()\n\tb.draw_it()\n");
put("addons/x.gd", "class_name Skipped\n");
put("vault/Bugs/BUG-001 box.md", "# box\n");
put("vault/Kod/Box.md", "---\nkod: box.gd\n---\n<!-- graph: an older marker text -->\n## Notlar\n- 2026-01-01: keep me\n");
const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
git("init", "-q");
git("add", "-A");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "BUG-001: box");

process.env.KOTAR_ROOT = dir;
const imp = (f) => import(pathToFileURL(path.join(import.meta.dirname, f)).href);
const core = await imp("core.mjs");
const q = await imp("queries.mjs");
const notes = await imp("notes.mjs");

assert.deepEqual(core.CONFIG.languages, ["gdscript"]);
assert.equal(core.CONFIG.notes, "vault/Kod");
const g = core.buildGraph();
assert.ok(!g.nodes.Skipped, "skip dirs are left out");
assert.ok(g.nodes.box_test.isTest);
assert.match(q.callers("Bus.ping"), /<- Box\.draw_it {2}box\.gd:5/);
assert.match(q.impact("Bus"), /1: Box/);
assert.match(q.impact("Bus"), /tests \(1\): test\/box_test\.gd/);
assert.match(q.classInfo("Box"), /keep me/, "notes under an older marker are read");
assert.match(q.history("BUG-001"), /box\.gd/);
assert.match(q.history("EXP-009"), /^EXP-009/); // an experiment id is a board id, not a class name
notes.writeAllNotes(g);
const note = fs.readFileSync(path.join(dir, "vault/Kod/Box.md"), "utf8");
assert.match(note, /Kullananlar|Kalıtım/);
assert.match(note, /\[\[BUG-001 box\]\]/);
assert.match(note, /keep me/, "hand-written notes survive regeneration");
assert.equal(note.match(/<!-- graph:/g).length, 1);
assert.match(q.noteAdd("Box", "a trap"), /Added/);
assert.match(q.classInfo("Box"), /a trap/);
assert.match(q.noteAdd("test/box_test.gd", "a test trap"), /Added/);
assert.doesNotMatch(notes.writeAllNotes(core.buildGraph()), /notes kept/, "a test note with lessons is kept quietly");
assert.match(fs.readFileSync(path.join(dir, "vault/Kod/test/box_test.md"), "utf8"), /a test trap/);
assert.deepEqual(q.lessonNames("- 2026-01-01: BUG-001/002: mouse_entered/exited ile değil; `PictureBox.fit(side)` ve stat_run_*.json, ihtiyaç picture_box_test"), ["mouse_entered", "exited", "PictureBox", "picture_box_test"].filter((n) => n !== "exited"));
assert.match(q.noteAdd("Box", "BUG-002: draw_it ve gone_helper kullan, box_test bakar"), /Added/);
const st = q.stale();
assert.match(st, /^1 lesson\(s\) may be stale/);
assert.match(st, /not found: gone_helper$/m, "draw_it is in the code, box_test is a file, gone_helper is nowhere");
fs.rmSync(dir, { recursive: true, force: true });
console.log("graph tests passed");

// node graph/lang.test.mjs — the Python and JS adapters on a tiny two-language repo.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kotar-lang-"));
const put = (f, t) => (fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }), fs.writeFileSync(path.join(dir, f), t));
put(".claude/kotar.md", "## Board\n- Board folder: `vault`\n\n## Code graph\n- Languages: python, js\n- Tests: backend/tests/, frontend/tests/\n");
put("backend/app/__init__.py", "");
put("backend/app/geometry/__init__.py", "");
put("backend/app/geometry/animation.py", '"""Poses the skeleton.\n\nMore text."""\nimport math\n\n\ndef pose(frame):\n    """One frame\'s pose."""\n    return _ease(frame)  # comment (not a call)\n\n\ndef _ease(t):\n    return math.sin(t)\n\n\nclass Rig:\n    def __init__(self):\n        self.reset()\n\n    def reset(self):\n        s = "fake(call)"\n        return s\n');
put("backend/app/steps/sheet.py", "from ..geometry import animation\nfrom app.geometry.animation import Rig, pose as p\n\n\ndef draw(x):\n    animation.pose(x)\n    r = Rig()\n    r.reset()\n    return p(\n        x,\n    )\n");
put("backend/tests/test_sheet.py", "from app.steps.sheet import draw\n\n\ndef test_draw():\n    draw(1)\n");
put("frontend/src/geometry/animation.js", "// The twin of backend animation.py.\nexport function pose(frame) {\n  return ease(frame);\n}\n\nconst ease = (t) => Math.sin(t);\n\nexport class Clock {\n  tick() {\n    return this.now();\n  }\n  now() {\n    return 1; // now()\n  }\n}\n");
put("frontend/src/pages/Studio.jsx", 'import { pose, Clock } from "../geometry/animation.js";\nimport * as anim from "../geometry/animation";\n\n/** The animation page. */\nexport default function Studio() {\n  const s = `x ${y}(`;\n  const c = new Clock();\n  c.tick();\n  return <div>{anim.pose(1) + pose(2)}</div>;\n}\n');
put("frontend/tests/studio.test.jsx", 'import Studio from "../src/pages/Studio.jsx";\ntest("x", () => Studio());\n');
const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
git("init", "-q");
git("add", "-A");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "BUG-002: twins");

process.env.KOTAR_ROOT = dir;
const imp = (f) => import(pathToFileURL(path.join(import.meta.dirname, f)).href);
const core = await imp("core.mjs");
const q = await imp("queries.mjs");
const g = core.buildGraph();

// names: Python first (config order), the JS twin gets its extension; packages are named by their folder
assert.equal(g.byFile["backend/app/geometry/animation.py"], "animation");
assert.equal(g.byFile["frontend/src/geometry/animation.js"], "animation (js)");
assert.equal(g.byFile["backend/app/geometry/__init__.py"], "geometry");
assert.equal(g.nodes.animation.desc, "Poses the skeleton.");
assert.equal(g.nodes.animation.funcs.pose.doc, "One frame's pose.");
assert.ok(g.nodes.animation.funcs["Rig.reset"]);
assert.ok(g.nodes.test_sheet.isTest && g.nodes["studio.test"].isTest);

// Python calls: module alias, imported alias, class constructor, self, local; comments and strings are not calls
const py = q.callers("animation.pose");
assert.match(py, /<- sheet\.draw {2}backend\/app\/steps\/sheet\.py:6/);
assert.match(py, /<- sheet\.draw {2}backend\/app\/steps\/sheet\.py:9/, "pose imported as p, call spread over lines");
assert.match(q.callers("animation._ease"), /<- animation\.pose/);
assert.match(q.callers("animation.Rig.reset"), /<- animation\.Rig\.__init__/);
assert.match(q.callers("animation.Rig.__init__"), /<- sheet\.draw/);
assert.doesNotMatch(q.callees("animation.Rig.reset"), /fake/);
assert.match(q.impact("animation"), /1: sheet/);
assert.match(q.impact("animation"), /tests \(1\): backend\/tests\/test_sheet\.py/);

// JS: named import, namespace import, local arrow, this-call, a class method; template strings are not calls
const jsCallers = q.callers("animation (js).pose");
assert.match(jsCallers, /<- Studio\.Studio {2}frontend\/src\/pages\/Studio\.jsx:9/);
assert.match(q.callers("animation (js).ease"), /<- animation \(js\)\.pose/);
assert.match(q.callers("animation (js).Clock.now"), /<- animation \(js\)\.Clock\.tick/);
assert.match(q.callers("animation (js).Clock.tick"), /possible[\s\S]*Studio\.Studio/, "c.tick() on an untyped value is possible");
assert.match(q.classInfo("Studio"), /The animation page|Studio\(\)/);
assert.deepEqual(q.dependents(["frontend/src/geometry/animation.js"]), ["frontend/src/pages/Studio.jsx"]);
assert.match(q.history("BUG-002"), /animation\.js/);
fs.rmSync(dir, { recursive: true, force: true });
console.log("lang tests passed");

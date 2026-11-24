// Python adapter for the kotar code graph: one node per module (.py), its functions and class methods
// ("Class.method"), uses from imports, calls resolved through import bindings, `self`/`cls` and local names.
// Modules resolve by dotted suffix (`app.steps.x` -> .../app/steps/x.py) or relative to the file (`from ..x import`).
// shortcut: regex parsing; calls on values whose type is unknown (obj.method()) are only "possible" callers.
import fs from "node:fs";
import path from "node:path";
import { indentOf, sanitize } from "./text.mjs";

export const globs = ["*.py"];
const KEYWORDS = new Set([
  "if", "elif", "while", "for", "return", "def", "class", "with", "assert", "not", "and", "or", "in", "is", "lambda",
  "yield", "await", "print", "super", "except", "raise", "del", "import", "from", "async", "else", "try", "match", "case",
]);

function moduleDesc(raw) {
  const doc = raw.match(/^(?:\s*#[^\n]*\n|\s*\n)*\s*[rRuUbBfF]*("""|''')([\s\S]*?)\1/);
  if (doc) return doc[2].split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  return raw.split("\n").filter((l) => /^#(?!!)/.test(l)).map((l) => l.replace(/^#+\s?/, "")).join(" ").trim();
}

function docAfter(rawLines, i) {
  for (let j = i + 1; j < rawLines.length && j < i + 4; j++) {
    const t = rawLines[j].trim();
    if (!t) continue;
    const m = t.match(/^[rRuUbBfF]*("""|''')(.*)/);
    return m ? m[2].replace(/("""|''').*$/, "").trim().slice(0, 160) : "";
  }
  return "";
}

function parse(ROOT, file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const rawLines = raw.split("\n");
  const code = sanitize(raw).split("\n");
  const dict = () => Object.create(null); // names like "constructor" or "toString" must not hit Object.prototype
  const m = { file, kind: "module", desc: moduleDesc(raw), funcs: dict(), signals: {}, vars: {}, classes: dict(), imports: [], sites: [] };
  const scopes = []; // { kind: "class" | "def", name, indent }
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    let line = code[i];
    if (!line.trim()) continue;
    const ind = indentOf(line);
    const continued = depth > 0 || /\\\s*$/.test(code[i - 1] || "");
    depth = Math.max(0, depth + (line.match(/[([{]/g) || []).length - (line.match(/[)\]}]/g) || []).length);
    if (!continued) while (scopes.length && scopes.at(-1).indent >= ind) scopes.pop();
    const cls = scopes.findLast((s) => s.kind === "class")?.name;
    const fn = scopes.findLast((s) => s.kind === "def");

    const im = line.match(/^\s*import\s+(.+)/);
    if (im) for (const part of im[1].split(",")) {
      const [mod, alias] = part.trim().split(/\s+as\s+/);
      if (mod) m.imports.push({ kind: "import", mod: mod.trim(), alias: (alias || mod).trim() });
    }
    const fm = line.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)/);
    if (fm) {
      let names = fm[3];
      if (names.includes("(") && !names.includes(")")) {
        for (let j = i + 1; j < code.length && j < i + 60; j++) {
          names += " " + code[j];
          if (code[j].includes(")")) break;
        }
      }
      for (const part of names.replace(/[()\\]/g, " ").split(",")) {
        const [name, alias] = part.trim().split(/\s+as\s+/);
        if (name && name !== "*") m.imports.push({ kind: "from", dots: fm[1].length, mod: fm[2], name: name.trim(), alias: (alias || name).trim() });
      }
    }

    const cd = line.match(/^(\s*)class\s+(\w+)/);
    if (cd && !continued) {
      if (!fn && !cls) m.classes[cd[2]] = { line: i + 1 };
      scopes.push({ kind: "class", name: cls ? `${cls}.${cd[2]}` : cd[2], indent: ind });
      continue;
    }
    const dd = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)?(?:\s*->\s*([^:]+))?/);
    if (dd && !continued) {
      const name = fn ? fn.name : cls ? `${cls}.${dd[2]}` : dd[2]; // a nested def counts as its outer function
      if (!fn) m.funcs[name] = { line: i + 1, static: false, returns: dd[4]?.trim() || null, doc: docAfter(rawLines, i), params: (dd[3] || "").replace(/\s+/g, " ").trim() };
      scopes.push({ kind: "def", name, indent: ind });
      line = line.slice(line.indexOf("(", line.indexOf("def")));
    }
    const from = (dd ? scopes.at(-1) : fn)?.name || "<module>";
    for (const c of line.matchAll(/([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*\(/g)) {
      const chain = c[1].split(/\s*\.\s*/);
      const before = line[c.index - 1] || "";
      const unknownRecv = before === "." || before === ")" || before === "]" || before === '"' || before === "'";
      const method = chain.pop();
      if (!chain.length && !unknownRecv && KEYWORDS.has(method)) continue;
      m.sites.push({ from, line: i + 1, recv: unknownRecv ? null : chain, method, cls, unknownRecv });
    }
  }
  return m;
}

// files -> the language part of the graph (core adds history, board links and usedBy).
export function build(ROOT, files, { isTest, taken = new Set() }) {
  const mods = files.filter((f) => f.endsWith(".py")).map((f) => parse(ROOT, f));
  const byPath = Object.fromEntries(mods.map((m) => [m.file, m]));
  const bySuffix = {};
  for (const m of mods) {
    const parts = m.file.replace(/\.py$/, "").replace(/\/__init__$/, "").split("/");
    for (let k = 0; k < parts.length; k++) (bySuffix[parts.slice(k).join(".")] ||= []).push(m);
  }
  const absolute = (dotted) => (bySuffix[dotted]?.length === 1 ? bySuffix[dotted][0] : null);
  const relative = (file, dots, dotted) => {
    const dir = path.posix.dirname(file).split("/");
    const base = [...dir.slice(0, dir.length - (dots - 1)), ...(dotted ? dotted.split(".") : [])].join("/");
    return byPath[`${base}.py`] || byPath[`${base}/__init__.py`] || null;
  };

  const nodes = {}, byFile = {};
  for (const m of mods) {
    const stem = path.posix.basename(m.file, ".py");
    const base = stem === "__init__" ? path.posix.basename(path.posix.dirname(m.file)) : stem;
    let name = [base, `${base} (py)`, `${base} (${path.posix.basename(path.posix.dirname(m.file))})`].find((n) => !taken.has(n)) || m.file;
    taken.add(name);
    Object.assign(m, { name, isTest: isTest(m.file), autoload: false, parent: null, extends: null, emitList: [] });
    nodes[name] = m;
    byFile[m.file] = name;
  }
  const defsByMethod = Object.create(null);
  for (const m of mods) {
    if (m.isTest) continue;
    for (const f of Object.keys(m.funcs)) (defsByMethod[f.split(".").pop()] ||= []).push(m.name);
  }

  const calls = [], uses = {}, possible = Object.create(null);
  const addUse = (a, b) => b && a !== b && (uses[a] ||= new Set()).add(b);
  const fnIn = (mod, sym) => (mod.funcs[sym] ? `${mod.name}.${sym}` : mod.funcs[`${sym}.__init__`] ? `${mod.name}.${sym}.__init__` : null);
  for (const m of mods) {
    const bind = Object.create(null); // alias -> { mod, sym? }
    for (const im of m.imports) {
      if (im.kind === "import") {
        const t = absolute(im.mod);
        if (t) (bind[im.alias] = { mod: t }), addUse(m.name, t.name);
        continue;
      }
      const baseMod = im.dots ? relative(m.file, im.dots, im.mod) : absolute(im.mod);
      const sub = im.dots ? relative(m.file, im.dots, im.mod ? `${im.mod}.${im.name}` : im.name) : absolute(`${im.mod}.${im.name}`);
      if (sub) (bind[im.alias] = { mod: sub }), addUse(m.name, sub.name);
      else if (baseMod) (bind[im.alias] = { mod: baseMod, sym: im.name }), addUse(m.name, baseMod.name);
    }
    for (const s of m.sites) {
      let to = null;
      if (!s.unknownRecv && !s.recv.length) {
        to = fnIn(m, s.method) || (bind[s.method]?.sym ? fnIn(bind[s.method].mod, bind[s.method].sym) : null);
        if (!to && !bind[s.method]) continue; // builtin or unknown name
      } else if (!s.unknownRecv) {
        const head = s.recv.join(".");
        if ((head === "self" || head === "cls") && s.cls) to = m.funcs[`${s.cls}.${s.method}`] ? `${m.name}.${s.cls}.${s.method}` : null;
        else if (bind[head] && !bind[head].sym) to = fnIn(bind[head].mod, s.method);
        else if (bind[head]?.sym) to = fnIn(bind[head].mod, `${bind[head].sym}.${s.method}`);
        else if (m.classes[head]) to = fnIn(m, `${head}.${s.method}`);
      }
      if (to) {
        calls.push({ from: `${m.name}.${s.from}`, to, file: m.file, line: s.line, how: "çağrı" });
        addUse(m.name, to.split(".")[0]);
      } else if (defsByMethod[s.method] && !s.method.startsWith("_")) {
        (possible[s.method] ||= []).push({ from: `${m.name}.${s.from}`, file: m.file, line: s.line });
      }
    }
  }
  return { nodes, byFile, scenes: {}, calls, uses, possible, defsByMethod, global: {} };
}

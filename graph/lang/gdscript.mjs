// GDScript adapter for the kotar code graph: .gd scripts and .tscn scenes -> classes, functions, signals,
// calls (typed receivers resolved), uses, signal and scene connections. Autoloads come from project.godot.
import fs from "node:fs";
import path from "node:path";
import { indentOf, sanitize } from "./text.mjs";

export const globs = ["*.gd", "*.tscn"];

const KEYWORDS = new Set([
  "if", "elif", "while", "for", "match", "return", "func", "assert", "preload", "load", "await", "not",
  "and", "or", "in", "is", "as", "super", "print", "push_error", "push_warning", "var", "const", "signal",
]);

function description(raw) {
  const lines = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("#")) break;
    const text = line.replace(/^#+\s?/, "").trim();
    if (text && !/^Ported from/i.test(text)) lines.push(text);
  }
  return lines.join(" ");
}

function typeName(t) {
  if (!t) return null;
  const m = t.match(/^(?:Array\[)?([A-Za-z_]\w*)/);
  return m ? m[1] : null;
}

// One .gd file -> raw facts; names are resolved later, once every class is known.
function parseScript(ROOT, file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const code = sanitize(raw).split("\n");
  const rawLines = raw.split("\n");
  const s = {
    file, kind: "script", className: null, extends: null, desc: description(raw),
    funcs: {}, signals: {}, vars: {}, preloads: [], idents: new Set(), sites: [], connects: [], emits: [],
  };
  const ext = raw.match(/^extends\s+(?:"([^"]+)"|([A-Za-z_][\w.]*))/m);
  if (ext) s.extends = ext[1] ? ext[1].replace("res://", "") : ext[2];
  const cn = raw.match(/^class_name\s+(\w+)/m);
  if (cn) s.className = cn[1];
  for (const m of raw.matchAll(/(?:preload|load)\(\s*"res:\/\/([^"]+)"/g)) s.preloads.push(m[1]);

  let fn = null; // current function { name, indent, locals }
  let inner = null; // current inner class { name, indent }
  let depth = 0; // open brackets carried over from earlier lines
  for (let i = 0; i < code.length; i++) {
    const line = code[i];
    if (!line.trim()) continue;
    const ind = indentOf(line);
    const continued = depth > 0 || /\\\s*$/.test(code[i - 1] || ""); // inside brackets or after a backslash
    depth = Math.max(0, depth + (line.match(/[([{]/g) || []).length - (line.match(/[)\]}]/g) || []).length);
    if (!continued && inner && ind <= inner.indent) inner = null;
    while (!continued && fn && ind <= fn.indent) fn = fn.outer; // a named lambda ends back in its function
    const ic = line.match(/^(\s*)class\s+(\w+)/);
    if (ic) {
      inner = { name: ic[2], indent: ind };
      continue;
    }
    const fd = line.match(/^(\s*)(?:@\w+\s+)*(static\s+)?func\s+(\w+)\s*\(([^)]*)\)?(?:\s*->\s*([\w\[\]]+))?/);
    let body = line;
    if (fd) {
      const name = fn ? fn.name : inner ? `${inner.name}.${fd[3]}` : fd[3];
      const doc = [];
      for (let j = i - 1; j >= 0 && /^\s*##/.test(rawLines[j]); j--) doc.unshift(rawLines[j].replace(/^\s*##\s?/, ""));
      const outer = fn;
      fn = { name, indent: ind, locals: outer ? { ...outer.locals } : {}, outer };
      let params = fd[4] || "";
      if (!/\)/.test(line.slice(line.indexOf("(", line.indexOf("func"))))) {
        for (let j = i + 1; j < code.length && j < i + 30; j++) {
          params += " " + code[j].split(")")[0];
          if (code[j].includes(")")) break;
        }
      }
      for (const p of params.split(",")) {
        const pm = p.match(/(\w+)\s*:\s*([\w\[\]]+)/);
        if (pm) fn.locals[pm[1]] = typeName(pm[2]);
      }
      if (!outer) s.funcs[name] = {
        line: i + 1, static: !!fd[2], returns: fd[5] || null, doc: doc.join(" ").slice(0, 160),
        params: params.replace(/\s+/g, " ").replace(/,\s*$/, "").trim(),
      };
      body = line.slice(line.indexOf("(", line.indexOf("func")));
    }
    const sg = line.match(/^\s*signal\s+(\w+)/);
    if (sg && !fn) s.signals[sg[1]] = { line: i + 1 };
    const vd = line.match(/^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:static\s+)?var\s+(\w+)\s*(?::\s*([\w\[\]]+))?\s*(:?=\s*([A-Za-z_]\w*)\.new\b)?/);
    if (vd) {
      const t = typeName(vd[2]) || vd[4] || null;
      if (fn) fn.locals[vd[1]] = t;
      else if (!inner) s.vars[vd[1]] = { line: i + 1, type: t };
      if (!fn && line.trimEnd().endsWith(":")) fn = { name: `<var ${vd[1]}>`, indent: ind, locals: {}, outer: null };
    }
    const fl = line.match(/^\s*for\s+(\w+)\s*:\s*([\w\[\]]+)\s+in\b/);
    if (fl && fn) fn.locals[fl[1]] = typeName(fl[2]);
    for (const m of body.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) s.idents.add(m[0]);
    const from = fn ? fn.name : "<class>";
    const locals = fn ? fn.locals : {};
    // calls: chain(  e.g. GameSession.world.request(  or  .foo(  or  bar(
    for (const m of body.matchAll(/([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*\(/g)) {
      const chain = m[1].split(/\s*\.\s*/);
      const before = body[m.index - 1] || "";
      const unknownRecv = before === "." || before === "$" || before === "%" || before === ")" || before === "]";
      const method = chain.pop();
      if (method === "connect" || method === "emit") continue;
      if (!chain.length && !unknownRecv && KEYWORDS.has(method)) continue;
      s.sites.push({ from, line: i + 1, recv: unknownRecv ? null : chain, method, locals, unknownRecv });
    }
    for (const m of body.matchAll(/([A-Za-z_][\w.]*)\.connect\(\s*([A-Za-z_][\w.]*)/g)) {
      s.connects.push({ from, line: i + 1, signal: m[1].split("."), handler: m[2].split("."), locals });
    }
    for (const m of body.matchAll(/([A-Za-z_][\w.]*)\.emit\(/g)) {
      s.emits.push({ from, line: i + 1, signal: m[1].split("."), locals });
    }
  }
  return s;
}

function parseScene(ROOT, file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const res = {};
  const nodes = {};
  const sc = { file, kind: "scene", scripts: [], scenes: [], rootScript: null, connections: [] };
  let cur = null;
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const er = line.match(/^\[ext_resource[^\]]*type="(\w+)"[^\]]*path="res:\/\/([^"]+)"[^\]]*id="([^"]+)"/)
      || line.match(/^\[ext_resource[^\]]*path="res:\/\/([^"]+)"[^\]]*type="(\w+)"[^\]]*id="([^"]+)"/);
    if (er) {
      const [type, p] = er[1].includes("/") || er[1].includes(".") ? [er[2], er[1]] : [er[1], er[2]];
      res[er[3]] = { type, path: p };
      if (type === "PackedScene") sc.scenes.push(p);
      continue;
    }
    const nd = line.match(/^\[node name="([^"]+)"(?:[^\]]*parent="([^"]*)")?/);
    if (nd) {
      const p = nd[2] === undefined ? "." : nd[2] === "." ? nd[1] : `${nd[2]}/${nd[1]}`;
      cur = p;
      const inst = line.match(/instance=ExtResource\("([^"]+)"\)/);
      if (inst && res[inst[1]]) nodes[p] = { scene: res[inst[1]].path };
      continue;
    }
    if (line.startsWith("[")) cur = null;
    const sm = line.match(/^script\s*=\s*ExtResource\("([^"]+)"\)/);
    if (sm && cur !== null && res[sm[1]]) {
      nodes[cur] = { ...(nodes[cur] || {}), script: res[sm[1]].path };
      sc.scripts.push(res[sm[1]].path);
      if (cur === ".") sc.rootScript = res[sm[1]].path;
    }
    const cm = line.match(/^\[connection signal="(\w+)" from="([^"]*)" to="([^"]*)" method="(\w+)"/);
    if (cm) sc.connections.push({ signal: cm[1], from: cm[2], to: cm[3], method: cm[4], line: i + 1, nodes });
  }
  return sc;
}

function autoloads(ROOT) {
  const out = {};
  const txt = fs.readFileSync(path.join(ROOT, "project.godot"), "utf8");
  const sec = txt.split(/^\[autoload\]$/m)[1];
  if (!sec) return out;
  for (const line of sec.split(/^\[/m)[0].split("\n")) {
    const m = line.match(/^(\w+)="\*?res:\/\/([^"]+\.gd)"/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// file -> [{ hash, date, subject, ids }], newest first (merge commits skipped).
// files -> the language part of the graph (core adds history, board links and usedBy).
export function build(ROOT, files, { isTest, taken: shared }) {
  const nodes = {}; // name -> node
  const byFile = {}; // file -> node name
  const scenes = {};
  const auto = autoloads(ROOT);
  const autoByFile = Object.fromEntries(Object.entries(auto).map(([k, v]) => [v, k]));
  const scripts = files.filter((f) => f.endsWith(".gd")).map((f) => parseScript(ROOT, f));
  for (const f of files.filter((f) => f.endsWith(".tscn"))) scenes[f] = parseScene(ROOT, f);

  const taken = shared || new Set(); // names are unique across all languages of the repo
  for (const s of scripts) {
    let name = s.className || autoByFile[s.file] || path.basename(s.file, ".gd");
    if (taken.has(name)) name = `${name} (${path.basename(path.dirname(s.file))})`;
    taken.add(name);
    s.name = name;
    s.isTest = isTest(s.file);
    s.autoload = !!autoByFile[s.file];
    nodes[name] = s;
    byFile[s.file] = name;
  }
  const global = {}; // identifiers code can name: class_name + autoloads
  for (const s of scripts) if (s.className || s.autoload) global[s.className || autoByFile[s.file]] = s.name;

  const parentOf = (s) => {
    if (!s.extends) return null;
    if (s.extends.endsWith(".gd")) return byFile[s.extends] || null;
    return global[s.extends] || null;
  };
  for (const s of scripts) s.parent = parentOf(s);
  const lookup = (cls, key, what) => {
    for (let c = cls, guard = 0; c && guard < 20; c = nodes[c]?.parent, guard++) {
      if (nodes[c]?.[what]?.[key]) return c;
    }
    return null;
  };
  const sceneScript = (p) => {
    const sc = scenes[p];
    return sc?.rootScript ? byFile[sc.rootScript] : null;
  };
  const defsByMethod = {};
  for (const s of scripts) {
    if (s.isTest) continue;
    for (const f of Object.keys(s.funcs)) (defsByMethod[f] ||= []).push(s.name);
  }

  // Type of a receiver chain inside class `cls` (null if unknown).
  const resolveChain = (cls, chain, locals) => {
    if (!chain.length) return cls;
    let [first, ...rest] = chain;
    let t;
    if (first === "self") t = cls;
    else if (first === "super") t = nodes[cls]?.parent;
    else if (locals && first in locals) t = global[locals[first]] || null;
    else if (lookup(cls, first, "vars")) t = global[nodes[lookup(cls, first, "vars")].vars[first].type] || null;
    else t = global[first] || null;
    for (const p of rest) {
      if (!t) return null;
      const owner = lookup(t, p, "vars");
      t = owner ? global[nodes[owner].vars[p].type] || null : null;
    }
    return t;
  };

  const calls = []; // { from: "Cls.fn", to: "Cls.fn", file, line, how }
  const uses = {}; // name -> Set(name)
  const addUse = (a, b) => {
    if (a && b && a !== b) (uses[a] ||= new Set()).add(b);
  };
  const possible = {}; // method -> [{ from, file, line }] call sites whose receiver type is unknown
  for (const s of scripts) {
    for (const id of s.idents) addUse(s.name, global[id]);
    if (s.parent) addUse(s.name, s.parent);
    for (const p of s.preloads) addUse(s.name, byFile[p] || sceneScript(p));
    for (const site of s.sites) {
      const from = `${s.name}.${site.from}`;
      let target = null;
      let how = "çağrı";
      if (site.unknownRecv) target = null;
      else if (!site.recv.length) {
        if (site.method === "super") continue;
        const owner = lookup(s.name, site.method, "funcs");
        if (owner) target = `${owner}.${site.method}`;
        else if (global[site.method]) continue;
        else continue; // builtin function
      } else {
        const t = resolveChain(s.name, site.recv, site.locals);
        if (t && site.method === "new") {
          target = `${t}.${lookup(t, "_init", "funcs") ? "_init" : "new"}`;
          how = "new";
        } else if (t) {
          const owner = lookup(t, site.method, "funcs");
          if (owner) target = `${owner}.${site.method}`;
          else continue; // engine method on a typed receiver
        }
      }
      if (target) {
        calls.push({ from, to: target, file: s.file, line: site.line, how });
        addUse(s.name, target.split(".")[0]);
      } else if (defsByMethod[site.method] && !site.method.startsWith("_")) {
        (possible[site.method] ||= []).push({ from, file: s.file, line: site.line });
      }
    }
    for (const c of s.connects) {
      const sigOwner = resolveChain(s.name, c.signal.slice(0, -1), c.locals);
      const sig = `${sigOwner || "?"}.${c.signal.at(-1)}`;
      const hOwnerT = resolveChain(s.name, c.handler.slice(0, -1), c.locals);
      const hOwner = hOwnerT ? lookup(hOwnerT, c.handler.at(-1), "funcs") : null;
      const handler = hOwner ? `${hOwner}.${c.handler.at(-1)}` : null;
      calls.push({ from: `${s.name}.${c.from}`, to: handler, signal: sig, file: s.file, line: c.line, how: "bağlar" });
      if (sigOwner) addUse(s.name, sigOwner);
    }
    s.emitList = s.emits.map((e) => {
      const owner = resolveChain(s.name, e.signal.slice(0, -1), e.locals);
      return { from: `${s.name}.${e.from}`, signal: `${owner || "?"}.${e.signal.at(-1)}`, line: e.line };
    });
  }
  for (const sc of Object.values(scenes)) {
    for (const c of sc.connections) {
      const toPath = c.to === "." ? "." : c.to;
      const script = c.nodes[toPath]?.script || (toPath === "." ? sc.rootScript : null);
      const owner = script && byFile[script] ? lookup(byFile[script], c.method, "funcs") : null;
      if (owner) calls.push({ from: `${sc.file}`, to: `${owner}.${c.method}`, signal: `${c.from}.${c.signal}`, file: sc.file, line: c.line, how: "sahne" });
    }
    const root = sc.rootScript && byFile[sc.rootScript];
    for (const p of [...sc.scripts, ...sc.scenes.map((x) => scenes[x]?.rootScript).filter(Boolean)]) {
      if (root) addUse(root, byFile[p]);
      if (byFile[p]) (nodes[byFile[p]].sceneFiles ||= new Set()).add(sc.file);
    }
  }

  return { nodes, byFile, scenes, calls, uses, possible, defsByMethod, global };
}

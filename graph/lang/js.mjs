// JavaScript adapter for the kotar code graph (.js .jsx .mjs .ts .tsx): one node per module, its top-level functions
// (function declarations and `const f = (...) =>`, React components included) and class methods ("Class.method");
// uses from relative imports, calls resolved through import bindings, `this` and local names.
// shortcut: regex parsing; a regex literal holding a quote or backtick can blank the rest of its line, and JSX
// <Component /> counts as a use (import), not a call.
import fs from "node:fs";
import path from "node:path";

export const globs = ["*.js", "*.jsx", "*.mjs", "*.ts", "*.tsx"];
const EXTS = [".js", ".jsx", ".mjs", ".ts", ".tsx"];
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "await", "import",
  "super", "new", "with", "else", "do", "try", "delete", "void", "in", "of", "instanceof", "yield", "async", "constructor"]);

// Comments removed, string and template contents emptied, newlines kept.
function sanitize(src) {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c + c;
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === "\n") { out += "\n"; if (c !== "`") break; }
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function moduleDesc(raw) {
  const lines = [];
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*")) break;
    const text = t.replace(/^(\/\/+|\/\*+|\*\/|\*)\s?/, "").replace(/\*\/$/, "").trim();
    if (text) lines.push(text);
  }
  return lines.join(" ");
}

const docBefore = (rawLines, i) => {
  const out = [];
  for (let j = i - 1; j >= 0 && /^\s*(\/\/|\*|\/\*\*)/.test(rawLines[j]); j--) out.unshift(rawLines[j].trim().replace(/^(\/\/+|\/\*+|\*\/|\*)\s?/, ""));
  return out.join(" ").replace(/\*\/$/, "").trim().slice(0, 160);
};

function parse(ROOT, file) {
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const rawLines = raw.split("\n");
  const code = sanitize(raw).split("\n");
  const dict = () => Object.create(null); // names like "constructor" or "toString" must not hit Object.prototype
  const m = { file, kind: "module", desc: moduleDesc(raw), funcs: dict(), signals: {}, vars: {}, classes: dict(), imports: [], sites: [] };
  let depth = 0;
  let cls = null; // { name, depth }
  let fn = null; // { name, depth }
  for (let i = 0; i < code.length; i++) {
    const line = code[i];
    const before = depth;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (!line.trim()) continue;

    // import a, { b as c } from "./x.js" / import * as ns from "./x" / export { a } from "./y" (may span lines)
    if (/^\s*(import|export)\b/.test(line) && before === 0) {
      let stmt = line, j = i;
      while (!/\bfrom\s*["']|^\s*import\s*["']/.test(rawLines[j]) && j < i + 40 && /\{[^}]*$|^\s*import\b[^;]*$/.test(stmt) && j + 1 < code.length) stmt += " " + code[++j];
      const spec = rawLines.slice(i, j + 1).join(" ").match(/(?:\bfrom\s*|^\s*import\s*)["']([^"']+)["']/)?.[1];
      if (spec && /^\s*(import|export\s*(\*|\{))/.test(stmt)) {
        const clause = stmt.replace(/\bfrom\s*["']{2}.*$/, "").replace(/^\s*(import|export)\s*(type\s+)?/, "");
        const names = [];
        const def = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(,|$)/);
        if (def && def[1] !== "type") names.push({ name: "default", alias: def[1] });
        const ns = clause.match(/\*\s*as\s+([\w$]+)/);
        if (ns) names.push({ name: "*", alias: ns[1] });
        for (const part of clause.match(/\{([^}]*)\}/)?.[1].split(",") || []) {
          const [name, alias] = part.trim().split(/\s+as\s+/);
          if (name) names.push({ name: name.trim(), alias: (alias || name).trim() });
        }
        m.imports.push({ spec, names });
      }
    }

    if (cls && before <= cls.depth && /\}/.test(line) && depth <= cls.depth) cls = null;
    const cd = line.match(/^\s*(?:export\s+)?(?:default\s+)?class\s+([\w$]+)/);
    if (cd && before === 0) { m.classes[cd[1]] = { line: i + 1 }; cls = { name: cd[1], depth: 0 }; }

    let def = null;
    if (before === 0) {
      def = line.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(([^)]*)/)
        || line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b[^(]*)?\(([^)]*)\)?[^=]*=>/)
        || line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?([\w$]+)\s*=>/)
        || line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?function\b\s*\*?\s*[\w$]*\s*\(([^)]*)/);
    } else if (cls && before === cls.depth + 1) {
      const md = line.match(/^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([\w$]+)\s*\(([^)]*)\)\s*\{/);
      if (md && !KEYWORDS.has(md[1]) || md?.[1] === "constructor") def = [md[0], `${cls.name}.${md[1]}`, md[2]];
    }
    if (def) {
      m.funcs[def[1]] = { line: i + 1, static: false, returns: null, doc: docBefore(rawLines, i), params: (def[2] || "").replace(/\s+/g, " ").trim() };
      fn = { name: def[1], depth: before };
    }
    const from = fn?.name || "<module>";
    const body = def ? line.slice(line.indexOf(def[0]) + def[0].length) : line;
    for (const c of body.matchAll(/([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g)) {
      const chain = c[1].split(/\s*\??\.\s*/);
      const prev = body[c.index - 1] || "";
      const unknownRecv = prev === "." || prev === ")" || prev === "]" || prev === '"' || prev === "'" || prev === "`" || prev === "?";
      const method = chain.pop();
      if (!chain.length && !unknownRecv && KEYWORDS.has(method)) continue;
      m.sites.push({ from, line: i + 1, recv: unknownRecv ? null : chain, method, cls: cls?.name, unknownRecv });
    }
    // A function ends when its braces close again, or on its own line when nothing is left open (a one-liner).
    // shortcut: an arrow whose body is `(` JSX `)` has no braces; it ends only at the next definition.
    if (fn) {
      if (depth > fn.depth) fn.open = true;
      if (fn.open && depth <= fn.depth) fn = null;
      else if (def && !fn.open && !/(\{|=>|\(|,)\s*$/.test(line)) fn = null;
    }
  }
  return m;
}

export function build(ROOT, files, { isTest, taken = new Set() }) {
  const mods = files.filter((f) => EXTS.includes(path.posix.extname(f))).map((f) => parse(ROOT, f));
  const byPath = Object.fromEntries(mods.map((m) => [m.file, m]));
  const resolve = (from, spec) => {
    if (!spec.startsWith(".")) return null; // a package
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) if (byPath[c]) return byPath[c];
    return null;
  };
  const nodes = {}, byFile = {};
  for (const m of mods) {
    const ext = path.posix.extname(m.file);
    let base = path.posix.basename(m.file, ext);
    if (base === "index") base = path.posix.basename(path.posix.dirname(m.file));
    const name = [base, `${base} (${ext.slice(1)})`, `${base} (${path.posix.basename(path.posix.dirname(m.file))})`].find((n) => !taken.has(n)) || m.file;
    taken.add(name);
    Object.assign(m, { name, isTest: isTest(m.file) || /\.(test|spec)\.[jt]sx?$/.test(m.file), autoload: false, parent: null, extends: null, emitList: [] });
    nodes[name] = m;
    byFile[m.file] = name;
  }
  const defsByMethod = Object.create(null);
  for (const m of mods) if (!m.isTest) for (const f of Object.keys(m.funcs)) (defsByMethod[f.split(".").pop()] ||= []).push(m.name);

  const calls = [], uses = {}, possible = Object.create(null);
  const addUse = (a, b) => b && a !== b && (uses[a] ||= new Set()).add(b);
  const fnIn = (mod, sym) => {
    if (sym === "default") sym = Object.keys(mod.funcs).find((f) => !f.includes(".")) || sym; // shortcut: default = first top-level function
    return mod.funcs[sym] ? `${mod.name}.${sym}` : mod.funcs[`${sym}.constructor`] ? `${mod.name}.${sym}.constructor` : null;
  };
  for (const m of mods) {
    const bind = Object.create(null);
    for (const im of m.imports) {
      const t = resolve(m.file, im.spec);
      if (!t) continue;
      addUse(m.name, t.name);
      for (const n of im.names) bind[n.alias] = n.name === "*" ? { mod: t } : { mod: t, sym: n.name };
    }
    for (const s of m.sites) {
      let to = null;
      if (!s.unknownRecv && !s.recv.length) {
        to = fnIn(m, s.method) || (bind[s.method]?.sym ? fnIn(bind[s.method].mod, bind[s.method].sym) : null);
        if (!to && !bind[s.method]) continue;
      } else if (!s.unknownRecv) {
        const head = s.recv.join(".");
        if (head === "this" && s.cls) to = m.funcs[`${s.cls}.${s.method}`] ? `${m.name}.${s.cls}.${s.method}` : null;
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

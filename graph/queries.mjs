// Graph questions answered as short plain text: find, class, callers, callees, impact, history, note.
// The CLI (graph.mjs) and the MCP server (mcp_server.mjs) print these strings as they are.
import fs from "node:fs";
import path from "node:path";
import { buildGraph, resolveSymbol, ROOT } from "./core.mjs";
import { notePath, readManualNotes, writeClassNote } from "./notes.mjs";

const LIMIT = 40;
const cap = (list, n = LIMIT) => (list.length > n ? [...list.slice(0, n), `... +${list.length - n} more`] : list);
const where = (n, line) => `${n.file}:${line}`;

export function find(query) {
  const g = buildGraph();
  const q = query.toLowerCase();
  const out = [];
  for (const n of Object.values(g.nodes)) {
    if (n.name.toLowerCase().includes(q) || n.file.toLowerCase().includes(q)) out.push(`class  ${n.name}  ${n.file}`);
    for (const [f, d] of Object.entries(n.funcs)) if (f.toLowerCase().includes(q)) out.push(`func   ${n.name}.${f}(${d.params})  ${where(n, d.line)}`);
    for (const [s, d] of Object.entries(n.signals)) if (s.toLowerCase().includes(q)) out.push(`signal ${n.name}.${s}  ${where(n, d.line)}`);
  }
  return out.length ? cap(out, 60).join("\n") : `Nothing matches "${query}".`;
}

export function classInfo(name) {
  const g = buildGraph();
  const r = resolveSymbol(g, name);
  if (!r?.cls) return r?.owners ? `"${name}" is a member of: ${r.owners.join(", ")}` : `No class "${name}".`;
  const n = g.nodes[r.cls];
  const out = [`${n.name}  (${n.file}${n.autoload ? ", autoload" : ""})`, n.desc && `  ${n.desc}`];
  out.push(`extends: ${n.parent || n.extends || "-"}`);
  out.push(`uses: ${[...(g.uses[n.name] || [])].sort().join(", ") || "-"}`);
  out.push(`used by: ${[...(g.usedBy[n.name] || [])].sort().join(", ") || "-"}`);
  if (n.sceneFiles) out.push(`scenes: ${[...n.sceneFiles].sort().join(", ")}`);
  const sig = Object.keys(n.signals);
  if (sig.length) out.push(`signals: ${sig.join(", ")}`);
  out.push("functions:");
  for (const [f, d] of Object.entries(n.funcs)) {
    const callers = g.calls.filter((c) => c.to === `${n.name}.${f}`).length;
    out.push(`  ${d.static ? "static " : ""}${f}(${d.params})${d.returns ? " -> " + d.returns : ""}  :${d.line}  callers ${callers}${d.doc ? "  # " + d.doc : ""}`);
  }
  const hist = g.history[n.file] || [];
  if (hist.length) out.push(`changes (${hist.length}): ` + cap(hist.map((h) => h.ids[0] || h.subject.slice(0, 30)).filter((v, i, a) => a.indexOf(v) === i), 15).join(", "));
  const manual = readManualNotes(notePath(g, n.name));
  if (manual) out.push("notes:\n" + manual);
  return out.filter(Boolean).join("\n");
}

function members(g, sym) {
  const r = resolveSymbol(g, sym);
  if (!r) return [];
  if (r.cls && r.member) {
    let c = r.cls;
    while (c && !g.nodes[c].funcs[r.member] && !g.nodes[c].signals[r.member]) c = g.nodes[c].parent;
    return c ? [`${c}.${r.member}`] : [];
  }
  if (r.owners) return r.owners.map((o) => `${o}.${r.member}`);
  return Object.keys(g.nodes[r.cls].funcs).map((f) => `${r.cls}.${f}`);
}

export function callers(sym, depth = 1) {
  const g = buildGraph();
  const targets = members(g, sym);
  if (!targets.length) return `No function "${sym}".`;
  const out = [];
  for (const t of targets) {
    const [cls, fn] = [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)];
    const lines = [];
    const testCalls = [];
    const walk = (to, d, pad) => {
      for (const c of g.calls.filter((c) => c.to === to)) {
        if (g.nodes[c.from.split(".")[0]]?.isTest) {
          if (d === 1) testCalls.push(c.file);
          continue;
        }
        const via = c.how === "bağlar" ? ` (connects ${c.signal})` : c.how === "sahne" ? ` (scene signal ${c.signal})` : "";
        lines.push(`${pad}<- ${c.from}  ${c.file}:${c.line}${via}`);
        if (d < depth && c.how !== "sahne") walk(c.from, d + 1, pad + "  ");
      }
    };
    walk(t, 1, "  ");
    const testFiles = [...new Set(testCalls)];
    if (testFiles.length) lines.push(`  tests: ${testCalls.length} calls in ${cap(testFiles, 8).join(" ")}`);
    const n = g.nodes[cls];
    const sig = n?.signals[fn];
    if (sig) {
      for (const e of Object.values(g.nodes).flatMap((x) => x.emitList.filter((e) => e.signal === t))) lines.push(`  emitted by ${e.from}`);
      for (const c of g.calls.filter((c) => c.signal === t)) lines.push(`  listened by ${c.to || "?"} (connected in ${c.from})`);
    }
    const maybe = g.defsByMethod[fn]?.length > 1 || !lines.length ? g.possible[fn] || [] : [];
    if (maybe.length) lines.push(`  possible (receiver type unknown, method defined in ${g.defsByMethod[fn].join(", ")}):`, ...cap(maybe.map((p) => `    ? ${p.from}  ${p.file}:${p.line}`), 15));
    out.push(`${t}${n?.funcs[fn] ? "  " + where(n, n.funcs[fn].line) : ""}`, ...(lines.length ? cap(lines) : ["  (no callers found)"]));
  }
  return out.join("\n");
}

export function callees(sym) {
  const g = buildGraph();
  const targets = members(g, sym);
  if (!targets.length) return `No function "${sym}".`;
  const out = [];
  for (const t of targets) {
    const list = g.calls.filter((c) => c.from === t);
    const emits = Object.values(g.nodes).flatMap((n) => n.emitList.filter((e) => e.from === t));
    out.push(t, ...cap([
      ...list.map((c) => `  -> ${c.to || "?"}${c.how === "bağlar" ? ` (connects to ${c.signal})` : ""}  :${c.line}`),
      ...emits.map((e) => `  emits ${e.signal}  :${e.line}`),
    ]));
    if (!list.length && !emits.length) out.push("  (calls no project function)");
  }
  return out.join("\n");
}

export function impact(target, depth = 3) {
  const g = buildGraph();
  const r = resolveSymbol(g, target);
  const start = r?.cls || r?.owners?.[0];
  if (!start) return `No class or file "${target}".`;
  const seen = new Map([[start, 0]]);
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const c of frontier) for (const u of g.usedBy[c] || []) if (!seen.has(u)) (seen.set(u, d), next.push(u));
    frontier = next;
  }
  const code = [...seen].filter(([n, d]) => d > 0 && !g.nodes[n].isTest);
  const tests = [...seen].filter(([n]) => g.nodes[n].isTest).sort((a, b) => a[1] - b[1]);
  const out = [`${start}: what depends on it (depth ${depth})`];
  for (let d = 1; d <= depth; d++) {
    const at = code.filter(([, x]) => x === d).map(([n]) => n).sort();
    if (at.length) out.push(`  ${d}: ${cap(at, 30).join(", ")}`);
  }
  out.push(`tests (${tests.length}): ${cap(tests.map(([n]) => g.nodes[n].file), 25).join(" ")}`);
  const manual = readManualNotes(notePath(g, start));
  if (manual) out.push("notes:\n" + manual);
  return out.join("\n");
}

export function history(target) {
  const g = buildGraph();
  const id = target.match(/^(BUG|ENH)-\d+$/i)?.[0].toUpperCase();
  if (id) {
    const files = Object.entries(g.history).filter(([, h]) => h.some((c) => c.ids.includes(id))).map(([f]) => f);
    const commits = [...new Set(Object.values(g.history).flat().filter((c) => c.ids.includes(id)).map((c) => `${c.hash} ${c.date} ${c.subject}`))];
    return [`${id}${g.board[id] ? "  (note: " + g.board[id] + ")" : ""}`, ...commits.map((c) => "  " + c),
      "files:", ...files.map((f) => `  ${f}${g.byFile[f] ? "  [" + g.byFile[f] + "]" : ""}`)].join("\n");
  }
  const r = resolveSymbol(g, target);
  if (!r?.cls) return `No class, file or BUG/ENH id "${target}".`;
  const n = g.nodes[r.cls];
  const hist = g.history[n.file] || [];
  return [`${n.name}  ${n.file}  (${hist.length} commits)`, ...cap(hist.map((h) => `  ${h.hash} ${h.date} ${h.subject}`), 30)].join("\n");
}

// Adds one dated line under the class note's "## Notlar" (the hand-written part the writer keeps).
export function noteAdd(name, text) {
  const g = buildGraph();
  const r = resolveSymbol(g, name);
  if (!r?.cls) return `No class "${name}".`;
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "Empty note.";
  if (line.length > 240) return `Too long (${line.length} chars): keep a note to one short line (max 240).`;
  const file = notePath(g, r.cls);
  if (!fs.existsSync(file)) writeClassNote(g, g.nodes[r.cls]);
  const today = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(file, `- ${today}: ${line}\n`);
  return `Added to ${path.relative(ROOT, file)}`;
}

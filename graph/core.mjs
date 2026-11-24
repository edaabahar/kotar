// Kotar code graph core: reads the repo's `## Code graph` section in .claude/kotar.md, lists files, runs the
// language adapters (lang/*.mjs) and adds what every language shares: which BUG/ENH commits changed each
// file, links to the board notes, and usedBy. Built from the working tree on demand (in-memory cache only).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as gdscript from "./lang/gdscript.mjs";
import * as js from "./lang/js.mjs";
import * as python from "./lang/python.mjs";

const ADAPTERS = { gdscript, python, js };
const ID_RE = /\b(BUG|ENH)-\d+\b/g;

function git(args, cwd = ROOT) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

// The project: KOTAR_ROOT, else the git top level of the working directory (in a worktree session that is the
// worktree; CLAUDE_PROJECT_DIR is the main checkout there), else of CLAUDE_PROJECT_DIR. A cwd inside the plugin
// itself (CLAUDE_PLUGIN_ROOT) is not the project.
const top = (dir) => (dir ? git(["rev-parse", "--show-toplevel"], dir).trim() : "");
const inPlugin = (dir) => process.env.CLAUDE_PLUGIN_ROOT && path.resolve(dir).startsWith(path.resolve(process.env.CLAUDE_PLUGIN_ROOT));
const fromCwd = inPlugin(process.cwd()) ? "" : top(process.cwd());
export const ROOT = path.resolve(process.env.KOTAR_ROOT || fromCwd || top(process.env.CLAUDE_PROJECT_DIR) || process.env.CLAUDE_PROJECT_DIR || process.cwd());

// `- Key: value` lines of .claude/kotar.md (backticks and <!-- comments --> stripped); graph keys under `## Code graph`.
export function readConfig(root = ROOT) {
  const file = process.env.KOTAR_CONFIG || path.join(root, ".claude/kotar.md"); // KOTAR_CONFIG: tests
  const txt = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const val = (section, key) => {
    const body = section ? txt.split(new RegExp(`^## ${section}\\s*$`, "m"))[1]?.split(/^## /m)[0] : txt;
    const m = body?.match(new RegExp(`^- ${key}:\\s*(.+)$`, "m"));
    return m ? m[1].replace(/<!--.*?-->/g, "").replaceAll("`", "").trim() : "";
  };
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const board = val("Board", "Board folder").replace(/\/$/, "");
  const languages = list(val("Code graph", "Languages"));
  return {
    board,
    languages,
    notes: val("Code graph", "Notes folder").replace(/\/$/, "") || (board && `${board}/Kod`),
    skip: list(val("Code graph", "Skip")),
    tests: list(val("Code graph", "Tests")),
  };
}

export const CONFIG = readConfig();
export const boardDir = () => path.join(ROOT, CONFIG.board);
// KOTAR_NOTES: write the notes elsewhere (to compare two runs without touching the board).
export const notesDir = () => process.env.KOTAR_NOTES || path.join(ROOT, CONFIG.notes);

export function checkConfig() {
  if (!CONFIG.languages.length) return `No code graph: add "- Languages: ..." under "## Code graph" to ${path.join(ROOT, ".claude/kotar.md")} (known: ${Object.keys(ADAPTERS).join(", ")}).`;
  const bad = CONFIG.languages.filter((l) => !ADAPTERS[l]);
  if (bad.length) return `Unknown graph language(s): ${bad.join(", ")} (known: ${Object.keys(ADAPTERS).join(", ")}).`;
  if (!CONFIG.notes) return `No notes folder: set "- Notes folder:" under "## Code graph" or "Board folder" under "## Board".`;
  return null;
}

const adapters = () => CONFIG.languages.map((l) => ADAPTERS[l]);
const globs = () => [...new Set(adapters().flatMap((a) => a.globs))];
const skipped = (f) => [CONFIG.notes + "/", ...CONFIG.skip].some((d) => d && f.startsWith(d));
const isTest = (f) => CONFIG.tests.some((t) => f.startsWith(t));

function listFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...globs()])
    .split("\n")
    .filter((f) => f && !skipped(f) && fs.existsSync(path.join(ROOT, f)));
}

// file -> [{ hash, date, subject, ids }], newest first (merge commits skipped).
function history() {
  const out = {};
  const log = git(["log", "--no-merges", "--date=short", "--format=%x1e%h%x1f%ad%x1f%s", "--name-only", "--", ...globs()]);
  for (const entry of log.split("\x1e")) {
    if (!entry.trim()) continue;
    const [head, ...files] = entry.split("\n");
    const [hash, date, subject] = head.split("\x1f");
    const ids = [...new Set(subject.match(ID_RE) || [])];
    for (const f of files) {
      if (!f) continue;
      (out[f] ||= []).push({ hash, date, subject, ids });
    }
  }
  return out;
}

// BUG-012 -> "BUG-012 sabit-kutu-kaydirma" (the board note's file name, for wiki links); any folder of the board.
function boardNotes() {
  const out = {};
  const dir = boardDir();
  if (!CONFIG.board || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || path.join(dir, e.name) === notesDir()) continue;
    for (const f of fs.readdirSync(path.join(dir, e.name))) {
      const m = f.match(/^((?:BUG|ENH)-\d+)\b.*\.md$/);
      if (m && !out[m[1]]) out[m[1]] = f.slice(0, -3);
    }
  }
  return out;
}

let cached = null;

// The whole graph; rebuilt when any file's mtime, the file list or HEAD changed.
export function buildGraph() {
  const problem = checkConfig();
  if (problem) throw new Error(problem);
  const files = listFiles();
  const head = git(["rev-parse", "HEAD"]).trim();
  const stamp = head + "|" + files.map((f) => f + ":" + fs.statSync(path.join(ROOT, f)).mtimeMs).join("|");
  if (cached && cached.stamp === stamp) return cached.graph;
  const prev = cached?.graph;

  const g = { nodes: {}, byFile: {}, scenes: {}, calls: [], uses: {}, possible: Object.create(null), defsByMethod: Object.create(null), global: {} };
  const taken = new Set();
  for (const a of adapters()) {
    const part = a.build(ROOT, files, { isTest, taken });
    for (const k of ["nodes", "byFile", "scenes", "possible", "defsByMethod", "global"]) Object.assign(g[k], part[k]);
    g.calls.push(...part.calls);
    for (const [k, set] of Object.entries(part.uses)) for (const v of set) (g.uses[k] ||= new Set()).add(v);
  }
  const usedBy = {};
  for (const [a, set] of Object.entries(g.uses)) for (const b of set) (usedBy[b] ||= new Set()).add(a);
  const hist = prev && prev.head === head ? prev.history : history();
  const graph = { head, ...g, usedBy, history: hist, board: boardNotes() };
  cached = { stamp, graph };
  return graph;
}

// "Cls.fn", "Cls", "fn" or a file path -> what it names.
export function resolveSymbol(g, sym) {
  sym = sym.replace(/^res:\/\//, "").trim();
  if (g.byFile[sym]) return { cls: g.byFile[sym] };
  if (g.nodes[sym]) return { cls: sym };
  const dot = sym.lastIndexOf(".");
  if (dot > 0) {
    const cls = g.nodes[sym.slice(0, dot)] ? sym.slice(0, dot) : g.global[sym.slice(0, dot)];
    if (cls) return { cls, member: sym.slice(dot + 1) };
    // "Module.Class.method" (Python/JS methods, GDScript inner classes): the module, then the dotted member
    const first = sym.indexOf(".");
    const mod = g.nodes[sym.slice(0, first)];
    if (mod?.funcs[sym.slice(first + 1)]) return { cls: mod.name, member: sym.slice(first + 1) };
  }
  const owners = Object.values(g.nodes).filter((n) => n.funcs[sym] || n.signals[sym]).map((n) => n.name);
  if (owners.length) return { member: sym, owners };
  const ci = Object.keys(g.nodes).find((k) => k.toLowerCase() === sym.toLowerCase());
  return ci ? { cls: ci } : null;
}

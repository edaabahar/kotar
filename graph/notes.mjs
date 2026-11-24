// Writes the code graph into the board vault as one short Obsidian note per script (Kod/<folder>/<Class>.md)
// plus the Kod/Kod Haritası.md index. Everything above the MARKER line is regenerated; the "## Notlar"
// part under it is hand-written and kept, also when a class is renamed (matched by its `kod:` path).
import fs from "node:fs";
import path from "node:path";
import { notesDir, ROOT } from "./core.mjs";

export const MARKER = "<!-- graph: bu satırın üstü üretilir (/kotar:index), altı elle yazılır -->";
// Any "<!-- graph:" line is the marker, so notes written under an older marker text keep their hand-written part.
const MARKER_RE = /^<!-- graph:.*-->\r?$/m;
const CAP_LINKS = 12;
const CAP_FUNCS = 8;
const CAP_CHANGES = 8;

const kodDir = notesDir;
export const notePath = (g, name) => path.join(kodDir(), path.dirname(g.nodes[name].file), `${name}.md`);

export function readManualNotes(file) {
  if (!fs.existsSync(file)) return "";
  const txt = fs.readFileSync(file, "utf8");
  const m = txt.match(MARKER_RE);
  if (!m) return "";
  return txt.slice(m.index + m[0].length).replace(/^\s*## Notlar\s*/, "").trim();
}

// The description's first sentence, at most 220 characters.
function shortDesc(desc) {
  const first = desc.match(/^.*?[.!?](?=\s|$)/)?.[0] || desc;
  return first.length > 220 ? first.slice(0, 217) + "..." : first;
}

const link = (n) => `[[${n}]]`;
const more = (list, n, fmt = (x) => x) => (list.length > n ? [...list.slice(0, n).map(fmt), `+${list.length - n} daha`] : list.map(fmt)).join(", ");

function render(g, n, manual) {
  const codeNode = (x) => g.nodes[x] && !g.nodes[x].isTest;
  const usesList = [...(g.uses[n.name] || [])].filter(codeNode).sort();
  const usedBy = [...(g.usedBy[n.name] || [])].sort();
  const usedByCode = usedBy.filter(codeNode);
  const tests = usedBy.filter((x) => g.nodes[x]?.isTest).map((x) => path.parse(g.nodes[x].file).name);

  const funcs = Object.keys(n.funcs)
    .filter((f) => !f.startsWith("_") || f === "_init")
    .map((f) => {
      const from = [...new Set(g.calls.filter((c) => c.to === `${n.name}.${f}` && !c.from.endsWith(".tscn"))
        .map((c) => c.from.split(".")[0]).filter((c) => c !== n.name && codeNode(c)))].sort();
      return { f, from };
    })
    .filter((x) => x.from.length)
    .sort((a, b) => b.from.length - a.from.length || a.f.localeCompare(b.f));
  const signals = Object.keys(n.signals).map((s) => {
    const to = [...new Set(g.calls.filter((c) => c.signal === `${n.name}.${s}`).map((c) => c.from.split(".")[0]).filter(codeNode))].sort();
    return { s, to };
  }).filter((x) => x.to.length);

  const hist = g.history[n.file] || [];
  const ids = [...new Set(hist.flatMap((h) => h.ids))];
  const parent = n.parent && codeNode(n.parent) ? link(n.parent) : n.extends ? `\`${n.extends}\`` : "-";

  const out = [
    "---",
    `kod: ${n.file}`,
    "tags: [kod]",
    `degisiklik: ${hist.length}`,
    "---",
    `# ${n.name}`,
    n.desc ? `> ${shortDesc(n.desc)}` : "",
    "",
    `- **Kalıtım:** ${parent}${n.autoload ? " (autoload)" : ""}`,
    usesList.length && `- **Kullandıkları:** ${more(usesList, CAP_LINKS, link)}`,
    usedByCode.length && `- **Kullananlar:** ${more(usedByCode, CAP_LINKS, link)}`,
    n.sceneFiles && `- **Sahneler:** ${[...n.sceneFiles].sort().map((s) => "`" + path.basename(s) + "`").join(", ")}`,
    funcs.length && `- **Dışarıdan çağrılanlar:** ${more(funcs, CAP_FUNCS, (x) => `\`${x.f}\` ← ${more(x.from, 4, link)}`).replaceAll(", `", "; `")}`,
    signals.length && `- **Sinyaller:** ${signals.map((x) => `\`${x.s}\` → ${more(x.to, 4, link)}`).join("; ")}`,
    tests.length && `- **Testler:** ${more(tests, 6, (t) => "`" + t + "`")}`,
    ids.length && `- **Değişiklikler:** ${more(ids, CAP_CHANGES, (id) => (g.board[id] ? link(g.board[id]) : id))}`,
    "",
    MARKER,
    "## Notlar",
    manual ? manual + "\n" : "",
  ];
  return out.filter((l) => l !== 0 && l !== undefined && l !== null && l !== false).join("\n");
}

export function writeClassNote(g, n, manual = "") {
  const file = notePath(g, n.name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = render(g, n, manual || readManualNotes(file));
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text);
  return file;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []);
}

function pruneEmpty(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name));
  if (dir !== kodDir() && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
}

function renderIndex(g, count) {
  const code = Object.values(g.nodes).filter((n) => !n.isTest);
  const hubs = code
    .map((n) => [n.name, [...(g.usedBy[n.name] || [])].filter((x) => !g.nodes[x].isTest).length])
    .sort((a, b) => b[1] - a[1]).slice(0, 20);
  const changed = code
    .map((n) => [n.name, new Set((g.history[n.file] || []).flatMap((h) => h.ids)).size])
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  return [
    "---",
    "tags: [kod]",
    "---",
    "# Kod Haritası",
    `Repo kodunun grafiği: ${count} script notu, her biri kimi kullanıyor, kim onu çağırıyor, hangi BUG/ENH değiştirdi.`,
    "Notların üstü `/kotar:index` ile üretilir; **Notlar** bölümü elle yazılır ve korunur.",
    "Ayrıntılı sorgu (fonksiyon düzeyi çağıranlar, etki alanı) için kotar'ın `code-graph` MCP araçları.",
    "",
    "## En çok kullanılanlar",
    hubs.map(([n, c]) => `${link(n)} (${c})`).join(" · "),
    "",
    "## En çok değişenler",
    changed.map(([n, c]) => `${link(n)} (${c})`).join(" · "),
    "",
  ].join("\n");
}

// Regenerates every note; returns a short report.
export function writeAllNotes(g) {
  const old = new Map(); // kod path -> { file, manual }
  for (const f of walk(kodDir())) {
    const m = fs.readFileSync(f, "utf8").match(/^kod: (.+)$/m);
    if (m) old.set(m[1].trim(), { file: f, manual: readManualNotes(f) });
  }
  const written = new Set();
  for (const n of Object.values(g.nodes)) {
    if (n.isTest) continue;
    const prev = old.get(n.file);
    written.add(writeClassNote(g, n, prev?.manual));
  }
  const kept = [];
  let removed = 0;
  for (const [kod, { file, manual }] of old) {
    if (written.has(file)) continue;
    if (g.byFile[kod] && !g.nodes[g.byFile[kod]].isTest) {
      fs.rmSync(file); // renamed class: its notes moved to the new note above
      removed++;
    } else if (manual) {
      kept.push(path.relative(ROOT, file)); // script gone, hand-written notes stay for a person to move
    } else {
      fs.rmSync(file);
      removed++;
    }
  }
  pruneEmpty(kodDir());
  fs.writeFileSync(path.join(kodDir(), "Kod Haritası.md"), renderIndex(g, written.size));
  return `${written.size} notes written, ${removed} removed` + (kept.length ? `; script gone, notes kept: ${kept.join(", ")}` : "");
}

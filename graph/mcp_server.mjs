// code-graph MCP server (stdio, newline-delimited JSON-RPC, no dependencies): the graph questions of
// queries.mjs as tools, so agents ask who calls what, what a change touches and why a file changed.
// Shipped with the kotar plugin (.mcp.json at the plugin root); the project's .claude/kotar.md "## Code graph" section
// picks the languages. The graph is rebuilt from the working tree whenever a file changed.
import readline from "node:readline";
import { callees, callers, classInfo, find, history, impact, noteAdd } from "./queries.mjs";

const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", description });
const TOOLS = [
  {
    name: "graph_find",
    description: "Find classes, functions and signals of the repo's code whose name (or file path) contains the text.",
    inputSchema: { type: "object", properties: { query: str("Part of a name, e.g. 'land' or 'owns_plot'.") }, required: ["query"] },
    run: (a) => find(a.query),
  },
  {
    name: "graph_class",
    description: "One class: file, description, extends, classes it uses and that use it, scenes, signals, every function with its line and caller count, the BUG/ENH ids that changed it, and the hand-written notes of its Obsidian note. Read these notes before changing the class.",
    inputSchema: { type: "object", properties: { name: str("class_name, autoload name or res path, e.g. 'LandController' or 'game/controllers/land_controller.gd'.") }, required: ["name"] },
    run: (a) => classInfo(a.name),
  },
  {
    name: "graph_callers",
    description: "Who calls a function (file:line), with signal and scene (.tscn) connections; for a signal, who emits and who listens. Calls whose receiver type cannot be inferred are listed as 'possible'.",
    inputSchema: {
      type: "object",
      properties: { symbol: str("'Class.function', 'Class.signal' or a bare function name."), depth: int("Caller levels to follow (default 1).") },
      required: ["symbol"],
    },
    run: (a) => callers(a.symbol, a.depth || 1),
  },
  {
    name: "graph_callees",
    description: "What a function calls and which signals it emits or connects.",
    inputSchema: { type: "object", properties: { symbol: str("'Class.function' or a bare function name.") }, required: ["symbol"] },
    run: (a) => callees(a.symbol),
  },
  {
    name: "graph_impact",
    description: "Everything that depends on a class (by level) and the test suites that reference it: what to check and test after changing it.",
    inputSchema: { type: "object", properties: { target: str("Class or res path."), depth: int("Levels (default 3).") }, required: ["target"] },
    run: (a) => impact(a.target, a.depth || 3),
  },
  {
    name: "graph_history",
    description: "Commits that changed a class or file, or for a BUG-nnn / ENH-nnn id its board note, commits and the files it changed.",
    inputSchema: { type: "object", properties: { target: str("Class, res path, or an id like 'BUG-076'.") }, required: ["target"] },
    run: (a) => history(a.target),
  },
  {
    name: "graph_note_add",
    description: "Add one short dated line (max 240 chars) to the Notlar section of a class's Obsidian note: a non-obvious rule, trap or reason behind a change that the next developer must know. Not a changelog (commits already record that).",
    inputSchema: { type: "object", properties: { name: str("Class name."), text: str("One short line, Turkish like the board notes.") }, required: ["name", "text"] },
    run: (a) => noteAdd(a.name, a.text),
  },
];

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return send({ id, result: {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "code-graph", version: "1.0.0" },
      instructions: "Code graph of this repo (kotar). Before changing a class, read graph_class (its notes) and graph_impact; after a change with a non-obvious rule, add one line with graph_note_add.",
    } });
  }
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list") {
    return send({ id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  }
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
    try {
      return send({ id, result: { content: [{ type: "text", text: tool.run(params.arguments || {}) }] } });
    } catch (e) {
      return send({ id, result: { content: [{ type: "text", text: String(e?.message || e) }], isError: true } });
    }
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: "Parse error" } });
  }
  handle(req);
});

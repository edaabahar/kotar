// Kotar code graph CLI: the same questions as the code-graph MCP server, plus `notes` (regenerate the Obsidian notes).
// node <kotar>/graph/graph.mjs <command> [args]   (run `help` for the list); the project is the git top level of the cwd.
import { buildGraph } from "./core.mjs";
import { writeAllNotes } from "./notes.mjs";
import { callees, callers, classInfo, dependents, find, history, impact, lessons, noteAdd, stale } from "./queries.mjs";

const HELP = `node <kotar>/graph/graph.mjs <command>
  find <text>              classes, functions and signals whose name contains the text
  class <Class|file>       a class: extends, uses, used by, functions, changes, notes
  callers <Class.fn|fn> [depth]   who calls it (also signal connections and scene connections)
  callees <Class.fn|fn>    what it calls and emits
  impact <Class|file> [depth]     what depends on it and which tests reference it
  history <Class|file|BUG-nnn|ENH-nnn|EXP-nnn>   commits of a class, or files a board note changed
  lessons <file...>        the Notlar of these files and who uses them (for a brief)
  dependents <file...>     files that use these files directly, tests included (for checks)
  stale [file...]          lessons whose script or named code is gone (all notes, or these files')
  note <Class> <text>      add one short line to the class note's Notlar
  notes                    regenerate the Kod notes (run on main after merges)`;

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  find: () => find(args.join(" ")),
  class: () => classInfo(args[0]),
  callers: () => callers(args[0], Number(args[1]) || 1),
  callees: () => callees(args[0]),
  impact: () => impact(args[0], Number(args[1]) || 3),
  history: () => history(args[0]),
  lessons: () => lessons(args),
  stale: () => stale(args),
  dependents: () => dependents(args).join("\n"),
  note: () => noteAdd(args[0], args.slice(1).join(" ")),
  notes: () => writeAllNotes(buildGraph()),
};
if (!commands[cmd] || (!["notes", "stale"].includes(cmd) && !args.length)) {
  console.log(HELP);
  process.exit(cmd === "help" || !cmd ? 0 : 1);
}
try {
  console.log(commands[cmd]());
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

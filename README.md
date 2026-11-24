# kotar

Claude Code plugin: Obsidian task boards for any project. You say what is wrong or what you want; kotar records it as notes, hands the work to side sessions (parallel worktrees) and merges the results into local `main`. It never pushes.

| Command | What it does |
|---|---|
| `/kotar <what to do>` | splits your text into items, decides for each whether it is a bug or an enhancement (asks when unsure), records notes, dispatches side sessions, merges finished branches |
| `/kotar:setup` | audits the project for missing kotar files, creates them, fills placeholders; asks before any worktree, commit or push |
| `/kotar` | re-reads the board and moves it forward ("check the board") |
| `/kotar:lessons` | shows the lessons for files, backfills them from done bug notes, proposes checks for traps that keep coming back |
| `/kotar:index` | rebuilds the code graph notes (one Obsidian note per file; hand-written **Notlar** kept) |

Bug: something that exists does not work as it should. Enhancement: something new, or a change to something that works as built; judged on five checks.

How a task goes:
1. **Record**: each item becomes a note (bug or enhancement) on the board.
2. **Plan**: before anything starts, kotar looks for similar finished work (done notes, git history of the files, your code graph if configured) and writes a scoped plan: files in and out of scope, approach, "done when", risks, size. Big items are split.
3. **Do**: a side session executes the plan in its own worktree; a check every 5 minutes nudges or re-dispatches stuck sessions.
4. **Review**: at merge, `review.mjs` measures time against the size budget and files changed outside the plan; the note gets a **Review** with warnings and suggestions, and repeated problems become proposed rules.

On screen: a live counter, `kotar · 3 waiting · 2 active · 14 done` (plus `· 1 stuck` when needed). On the desktop app it is a small widget you can drag; elsewhere it is a row above the prompt. Hidden in projects without a board.

## Using it in a project
The first `/kotar` in a project sets up the board:
1. It proposes a default location: `vault/` at the project root (`vault/Board/` if `vault/` is used for something else; the existing folder if the project already has a `Bug Board.md`).
2. Claude asks for your approval; you can name another folder. Nothing is created before you answer.
3. `templates/vault/` is copied to the board folder and `templates/kotar.md` to the project's `.claude/kotar.md` (existing files are never overwritten), then both are committed.
4. You fill the `<...>` placeholders in `.claude/kotar.md` (test command, shared files, checks).

## Code graph (optional)
Set `- Languages: gdscript` under `## Code graph` in `.claude/kotar.md` and the plugin's `code-graph` MCP server answers
who calls what, what a change touches and why a file changed (`graph_find`, `graph_class`, `graph_callers`, `graph_callees`,
`graph_impact`, `graph_history`, `graph_note_add`). Each file gets a note in the notes folder (default `<board>/Kod`);
everything above its `<!-- graph: -->` line is generated, the **Notlar** below it is the repo's own lessons and is kept.
Languages live in `graph/lang/` (one adapter per language).

Lessons: at merge, a bug's non-obvious root cause becomes one line in the Notlar of the class that holds it; each
side session's brief gets `graph.mjs lessons <planned files>` (those lines and who uses the files), not whole rules docs.

## Checks (optional)
Rows under `## Checks` in `.claude/kotar.md` (name, `block` or `warn`, file globs, budget in seconds, command with
`{files}`) run with `skills/kotar/scripts/checks.mjs` on the changed files plus the files that use them (code graph,
one level) — by the side session before it reports and by kotar before merging. Past its budget a check is stopped
and reported `SLOW`. Skipped, timed-out and let-through checks go to `.git/kotar/audit.jsonl`, read only on request.

## Install (once, global)
```powershell
claude plugin marketplace add edaabahar/kotar
claude plugin install kotar@kotar
```

## Develop
- Change the code, then run `claude plugin marketplace update kotar` and `claude plugin update kotar@kotar`, and open a new session.
- To try it without installing: `claude --plugin-dir <path-to-your-clone>`.
- List script test: `node skills/kotar/scripts/board_lists.test.mjs`.
- Review script test: `node skills/kotar/scripts/review.test.mjs`.
- Graph test: `node graph/graph.test.mjs`.
- Checks test: `node skills/kotar/scripts/checks.test.mjs`.
- Counter test: `node --experimental-strip-types hooks/count.test.mjs`.
- Bump `version` in `.claude-plugin/plugin.json` for every release.

# Kotar settings

This file is the project's `.claude/kotar.md`. `/kotar` reads it first.

## Board
- Board folder: `vault/`
- Obsidian vault root: `vault/`
- List script: yes  <!-- yes: the open/done lists and Board.canvas are rebuilt whenever notes change -->
- Commit: `git add <board folder> && git commit -m "Board: <what changed>" -- <board folder>`

## Brief
<!-- Items added to every side session's brief -->
- Rules: `CLAUDE.md` applies.
- Tests: `<test command>`; lint: `<lint command>`.
- Update any `docs/*` the change makes stale.

## Merge
<!-- Checks to run on main after a merge; if one fails the merge is undone -->
- `<test command>`

## Checks
<!-- Optional micro checks on the changed files and the files that use them (code graph, one level). Mode: block
     (a failure stops the merge) or warn (reported, audited). Budget in seconds: past it the check is stopped and
     reported SLOW (not verified), so keep each one small. {files} = the matching files, quoted. Example rows:
| lint | block | src/**/*.py | 30 | ruff check {files} |
| no fixed px in HUD | warn | ui/hud/** | 5 | node tools/check_px.mjs {files} |
-->
| Check | Mode | Files | Budget | Command |
|---|---|---|---|---|

## Known stalls
| Seen | Sign | Cause | Fix to send |
|---|---|---|---|

## Code graph
<!-- Optional. Languages turns on kotar's built-in graph (MCP tools graph_find, graph_class, graph_callers, graph_impact,
     graph_history, graph_note_add; notes per file in Notes folder, rebuilt with /kotar:index). Known: gdscript, python, js.
     Without Languages, name another tool here (e.g. a GitNexus query), or leave it empty for plain Grep. -->
- Languages: <!-- e.g. gdscript -->
- Notes folder: <!-- default: <board folder>/Kod -->
- Skip: <!-- folders left out, e.g. addons/, .godot/ -->
- Tests: <!-- test folders, e.g. test/ -->

## Enhancement checks
<!-- Left empty, the plugin's default five checks apply -->
1. **UX**: ...
2. **Method**: ...
3. **Visual consistency**: ...
4. **Output correctness**: ...
5. **Performance / cost**: ...

Extra checks (warn only): ...

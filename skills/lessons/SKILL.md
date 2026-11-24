---
name: lessons
description: The repo's own lessons (the Notlar lines of its code graph notes) - show them for files, backfill them from done bug notes, and spot traps that keep coming back as candidate checks. Use for "/kotar:lessons", "lessons for <file>", "backfill lessons", "extract lessons from old bugs", "which traps keep coming back".
---

# Kotar lessons

Lessons belong to the repo, never to kotar: one dated line in the `## Notlar` part of the note of the script that holds
the trap (the code graph's notes folder). They need **Code graph** `Languages` in `.claude/kotar.md`; without it, say
so and stop. The graph CLI is `node <this skill's directory>/../../graph/graph.mjs`.

## Show (`lessons for <files>`)
Run the graph CLI `lessons <files...>` and give its output as it is.

## Backfill (from done bug notes)
1. List the board's bug notes (`Bugs/` under the board folder). Split them into ranges of about 50-60 and give each
   range to a read-only subagent, in parallel. Each returns only a JSON array of
   `{"file": "<script path>", "ids": ["BUG-007"], "family": "<short slug>", "lesson": "<max 200 chars>"}`:
   the trap and what to check, in the board's language, one item per trap per file, all bug ids it came from.
   Keep only traps the code does not show and that can come back; skip typos, one-off visual tweaks, "not a bug"
   notes and lessons that only restate the fix; skip ids already in the notes folder's Notlar.
2. Merge the arrays: same file and same trap become one item with all ids. Check every `file` with the graph CLI
   `class <file>`; fix or drop the ones that do not resolve.
3. Show the user the list grouped by family (file, ids, lesson), with the count. Write nothing before a yes; apply
   their removals and edits.
4. On main (never a worktree), add each line with the graph CLI `note <file> "<ids>: <lesson>"`. Commit the notes
   folder with the **Board** commit command.

## Recurring traps
A family with lessons from three or more bug ids is a trap that keeps coming back. For each, propose one fast
**Checks** row (command, globs, budget) that would catch it, leaving the mode (`block` or `warn`) to the user; add a
row only on a yes.

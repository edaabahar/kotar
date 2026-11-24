---
name: lessons
description: The repo's own lessons (the Notlar lines of its code graph notes) - show them for files, backfill them from done bug notes, retire the ones new needs made stale (lessons, checks, brief items), and spot traps that keep coming back as candidate checks. Use for "/kotar:lessons", "lessons for <file>", "backfill lessons", "extract lessons from old bugs", "prune lessons", "which rules are stale", "which traps keep coming back".
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

## Retire (`prune lessons`, `which rules are stale`, or every few weeks of merges)
Rules that new needs made wrong or that point at code that is gone cost every brief context and mislead it.
1. Lessons: run the graph CLI `stale` (all notes). For each candidate, open the named code (or its git log) and judge:
   gone or renamed (reword to the new name, or delete when the trap went with it), still true but names an engine or
   library API the repo never calls (keep), or contradicted by a later decision or enhancement (delete).
2. Checks: run `node <this skill's directory>/../kotar/scripts/checks.mjs --history` in the main checkout. A row that is
   `broken`, skipped again and again, or timed out again and again is a candidate (fix its command, narrow it, or drop
   it); so is a row marked "never caught anything" (10+ runs, no catch: its trap may be gone, or it checks too little)
   and a row whose trap no lesson or bug mentions any more.
3. **Brief** and **Known stalls** items in `.claude/kotar.md` that name a tool, file or flake that is gone are candidates.
4. Show the user the candidates with the reason for each (and the evidence: the missing name, the audit counts).
   Change nothing before a yes. On a yes, delete or reword the line, and commit with the reason in the message
   (`Board: retire <rule>: <why>`); git history is the record of what was retired and why.

## Recurring traps
A family with lessons from three or more bug ids is a trap that keeps coming back. For each, propose one fast
**Checks** row (command, globs, budget) that would catch it, leaving the mode (`block` or `warn`) to the user; add a
row only on a yes.

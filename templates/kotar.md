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

## Known stalls
| Seen | Sign | Cause | Fix to send |
|---|---|---|---|

## Code graph
<!-- Optional: the tool or command planning uses for callers/dependents of files (e.g. a GitNexus query). Empty: plain Grep. -->

## Enhancement checks
<!-- Left empty, the plugin's default five checks apply -->
1. **UX**: ...
2. **Method**: ...
3. **Visual consistency**: ...
4. **Output correctness**: ...
5. **Performance / cost**: ...

Extra checks (warn only): ...

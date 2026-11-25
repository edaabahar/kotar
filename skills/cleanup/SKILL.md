---
name: cleanup
description: Remove the worktrees and branches of finished work (note done on the board, or branch merged into main), archive their sessions, and list what is left with the reason. Use for "/kotar:cleanup", "clean up worktrees", "delete old worktrees", "worktree temizle", "free disk from worktrees".
---

# Kotar cleanup

Finished work leaves a worktree, a branch and a session behind; they pile up. The script is
`node <this skill's directory>/scripts/worktrees.mjs`, run from the repo's main checkout (`--main <branch>` when main
is not `main`).

1. Run `list`. Each row: state, commits off main, uncommitted changes, ignored data that is not rebuildable
   (logs, outputs, presets; `node_modules`, `dist`, caches and `.env*` copies do not count), branch, path.
   States: `missing` (folder already gone), `merged`, `unmerged`, `dirty`.
2. Look up the sessions with `list_sessions` (`include_archived: true`, a high `limit`) and match them by `cwd`.
   Never touch a worktree whose session `isRunning`, or one used in the last 3 hours unless the user names it.
   With a board, read the notes' `branch`/`session`: a note `running`, `queued` or `merge-pending` keeps its worktree.
3. **Finished** (remove without asking): `missing`; `merged` with no ignored data; and any worktree whose note is
   `done`. Run `remove <paths...>`.
4. **The rest** (`unmerged`, `dirty`, ignored data): show the user one table (path, state, counts, ignored data,
   note or session title) and remove only what they pick, with the flags it needs:
   `--unmerged` (the branch is kept, so its commits stay), `--wip` (uncommitted changes become a WIP commit on the
   branch first), `--drop-ignored` (the ignored data is deleted; say which). "We will not go back to these" is a yes
   for all three.
5. Archive the session of every removed worktree (`archive_session`).
6. Report: removed count per repo, branches kept (with their commit counts: `git branch -D` is the user's call),
   folders left behind (Windows keeps a folder whose file a process holds; it can be deleted once that process ends),
   and what was left and why.

Never `--force` a removal and never delete a branch with commits off main; the script does neither.

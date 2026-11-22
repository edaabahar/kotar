---
name: kotar-setup
description: Check that a project has everything kotar needs (git repo, main branch, .claude/kotar.md, board folder and notes, filled-in placeholders) and create whatever is missing. Asks before any worktree, commit or push. Use for "set up kotar", "check kotar files", "kotar is missing something".
---

# Kotar setup

Audit first, change nothing until the user agrees. Work in the project's main checkout (never a worktree path).
Templates live in this plugin's `../../templates/`.

## 1. Audit (read-only)

Report one table: item, state (`ok` / `missing` / `incomplete`), what you would do.

| Item | Ok when |
|---|---|
| Git repo | `git rev-parse --show-toplevel` works |
| `main` branch | `refs/heads/main` exists (otherwise name the real default branch) |
| Clean tree | `git status --short` is empty; list what is dirty |
| `.claude/kotar.md` | exists; `Board folder` and `Obsidian vault root` are set |
| Board folder | contains `Bug Board.md`, `Enhancement Board.md`, `Bugs/`, `Enhancements/`, `Areas/General.md` (compare with `templates/vault/`) |
| Placeholders | no `<test command>`, `<lint command>` or other `<...>` left in `.claude/kotar.md` |
| `CLAUDE.md` | exists (only reported; creating it is optional) |

Placeholders: propose real values from the project (`package.json` scripts, `Makefile`, `pyproject.toml`,
`Cargo.toml`, `go.mod`, CI config). Never invent a command you did not find; leave it and say so.

If everything is `ok`, say so and stop.

## 2. Ask, then create

Use one question per decision (ask in chat and wait for the answer), before writing anything:

1. **Board folder** (only if missing): default `vault/` at the project root (`vault/Board/` if `vault/` is used
   for something else; the existing folder if a `Bug Board.md` already exists). Offer "Another folder".
2. **Create the missing files?** List them. Existing files are never overwritten; merge missing lines or sections
   into an existing `.claude/kotar.md` instead of replacing it.
3. **Fill placeholders?** Show the proposed values.
4. **Worktree** (only if the tree is dirty or the user wants isolation): "Do the setup in a separate worktree so
   your uncommitted work is untouched?" Default no. Never create a worktree without a yes.
5. **Commit**: "Commit these files to `<branch>`?" with the file list. Default yes, but ask. Use
   `git add <only the created files> && git commit -m "Kotar: set up" -- <those files>`; never `git add -A`.
6. **Push**: "Push `<branch>` to `<remote>`?" Default **no**. Kotar otherwise never pushes. Ask only after a commit exists.

Each answer covers only that action; a yes to commit is not a yes to push.

## 3. Verify

Re-run the audit and show the table again. State what was created, committed and pushed (or skipped), and what is
still `incomplete` (usually placeholders you could not fill).

---
name: index
description: Rebuild the project's code graph notes (one Obsidian note per file under the Code graph "Notes folder", hand-written Notlar kept). Use for "/kotar:index", "reindex", "rebuild the code graph", "regenerate the Kod notes".
---

# Kotar index

1. Work in the project's main checkout, never a worktree: notes are rebuilt only on `main`, after merges.
2. Read `.claude/kotar.md`. If `## Code graph` has no `Languages`, tell the user how to turn it on (see the template
   comment in this plugin's `../../templates/kotar.md`) and stop.
3. Run `node <this skill's directory>/../../graph/graph.mjs notes` from the main checkout. It rewrites everything above
   each note's `<!-- graph: ... -->` line and keeps the hand-written `## Notlar` below it.
4. Report its one-line result (notes written, removed, kept because the file is gone but notes were hand-written).
   Commit the notes folder only if the user asks (use the **Board** commit command with the notes folder).

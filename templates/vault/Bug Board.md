# Bug Board

Report bugs with `/kotar <description>`; Claude records them here, hands them to side sessions and merges them into local `main` (never pushes).
Graph: every note links its area and the notes it depends on with `[[link]]`. Improvements: [[Enhancement Board]]. Trials: [[Experiment Board]].

## How to steer
- Write in a note's **Guidance** section, change `priority` (`high` / `medium` / `low`) or add to `blockedBy`.
- Then run `/kotar` in chat with no arguments. Claude reads the notes before it starts or merges anything.

## Statuses
`new` → `queued` (waiting on other work) → `running` → `merge-pending` → `done`; `stuck` when it cannot move forward or needs your answer.

## Conflict rule
- Work in the same area runs **in sequence**, different areas run **in parallel worktrees**.
- Shared files (they queue work even across areas): <list them here>
- `docs/*` and board overlap never block anything.
- Running enhancements follow the same rule; at equal priority bugs go first.
- Experiments never block: bugs and enhancements start and merge as if no experiment were running, and an experiment
  runs alongside anything. Its session accepts up front that it resolves every conflict with main itself.

## Areas
- [[General]]

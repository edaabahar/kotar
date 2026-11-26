# Experiment Board

Try an idea whose outcome is unknown with `/kotar <description>`; Claude records it here, runs it in a side session and reports what the measurement showed. Bugs: [[Bug Board]]. Improvements: [[Enhancement Board]].

## How to steer
- Write in a note's **Guidance** section, change `priority` or add to `blockedBy`.
- Then run `/kotar` in chat with no arguments.

## Statuses
Same as [[Bug Board]]; `done` means the question is answered (supported, contradicted or inconclusive), not that the code was merged.

## Rules
- An experiment never blocks real work: bugs and enhancements start, run and merge as if it were not there, and nothing waits for it.
- It runs alongside anything, even in the same area or files. Its session accepts up front that main will move under it and that it resolves every conflict itself: it rebases on main, keeps main's behaviour and re-applies the trial on top.
- Its code reaches main only on your yes (adopt it as is, or turn it into an enhancement); otherwise the branch is kept for reference and the worktree is removed.

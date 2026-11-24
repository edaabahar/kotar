---
name: kotar
description: Project work board - take what the user reports (bugs, improvements, or a mix), sort each item into a bug or an enhancement yourself, record it as an Obsidian note, build it in side sessions (parallel worktrees where they cannot conflict) and merge into local main. Use for "/kotar <what to do>", for "/kotar" alone, and for "check the board" to re-read the board and move it forward.
---

# Kotar board

The user tells you what is wrong or what they want; they steer from Obsidian. They do not sort, manage sessions
or merge; you do. All state lives in the notes, never in your memory or this conversation, so any session can run this.

## Project config (read first)

Everything project-specific lives in the project's `.claude/kotar.md`. Read it before anything else.
Its sections fill in the gaps marked *(config)* below:

- **Board**: board folder, Obsidian vault root, how board changes are committed, whether the list script runs.
- **Brief**: extra steps every side session's brief must contain (setup, rules files, tests, lint, screenshots).
- **Merge**: checks to run on main after a merge, and what to do when they fail.
- **Known stalls**: known stalls (sign → fix), used by step 0b.
- **Enhancement checks**: the five checks and their reference files, plus extra warning-only checks.
- **Code graph** (optional): `Languages` turns on kotar's built-in graph (the `code-graph` MCP tools; per-file notes
  rebuilt with `/kotar:index`); otherwise a tool or command for callers and dependents of files (used only when planning, step 2b).
  The per-file notes' **Notlar** are the repo's own lessons; kotar itself holds none.
- **Checks** (optional): micro checks, one table row each: name, mode (`block` stops the merge, `warn` only
  reports; the user picks), file globs, time budget in seconds, command (`{files}` = the matching files). They run
  only on the changed files and the files that use them (`scripts/checks.mjs`).

The graph CLI is `node <this skill's directory>/../../graph/graph.mjs` (called *graph CLI* below).

If `.claude/kotar.md` is missing, this is the first run in this project: do **First run** below before anything else.

## First run (no `.claude/kotar.md` yet)

The board always lives inside the project, in the main checkout (never a worktree path; use
`git rev-parse --path-format=absolute --git-common-dir` and its parent folder to find the main checkout).

1. Pick the default location: `vault/` at the main checkout's root. If `vault/` already exists and is not a
   board (no `Bug Board.md`), default to `vault/Board/` instead, with `vault/` as the Obsidian vault root.
   If a board already exists somewhere in the project (a `Bug Board.md` anywhere), default to that folder.
2. Ask the user once with `AskUserQuestion`, before writing anything: "Set up the board in `<path>` for this project?" with the default as the first, recommended option and "Another folder" as the
   second (the user types the folder). Nothing is created until they answer; a "no" stops the run.
3. Create the board from this plugin's `templates/` folder (`../../templates/` from this skill's directory).
   Never overwrite a file that already exists:
   - `templates/vault/*` → the chosen board folder (`Bug Board.md`, `Enhancement Board.md`, `Areas/Genel.md`,
     empty `Bugs/` and `Enhancements/`; skip the `.gitkeep` files);
   - `templates/kotar.md` → `.claude/kotar.md`, with **Board** set to the chosen board folder and vault root.
     Fill **Brief** and **Merge** from what the repo shows (CLAUDE.md / AGENTS.md, package scripts, test and
     lint configs); where unsure, leave the `<...>` placeholder.
4. Commit both: `git add .claude/kotar.md <board folder> && git commit -m "Board: set up" -- .claude/kotar.md <board folder>`.
5. Tell the user, briefly: where the board is, to open the vault root in Obsidian, which placeholders in
   `.claude/kotar.md` and in `Bug Board.md` ("Shared files") they should fill. Then continue with the
   request as normal.

## Board basics

Notes are written in English. There is no Obsidian MCP: read and write the markdown files directly.
The board's own `Bug Board.md` / `Enhancement Board.md` rules win over this file if they differ.
List script *(config: Board)*: when enabled, whenever you create a note or change its `status`, run
`node <this skill's directory>/scripts/board_lists.mjs "<board folder>" "<vault root>"`: it rebuilds the
open/done lists in both board notes and the `Board.canvas` overview. Never edit those lists or the canvas by hand.
Only the main checkout edits the board; side sessions never touch it. After each board change, commit only
the board from the main checkout *(config: Board, message style)*, so unrelated work is never swept in.

Argument: free text with one or more items. Empty argument means skip step 2.
Invoking `/kotar` is the user's standing approval to start side sessions for these items, to merge their
branches into local `main` and to commit the board. It does not cover `git push`; never push.

## The five checks (enhancements)

The five checks are the project's own (**Enhancement checks** *(config)*). Every enhancement is judged on
all five, before building (plan) and after (result). If that section is empty, use these defaults and say so:

1. **UX**: nothing pops in or jumps; house components before new ones; the user never repeats work to get a result.
2. **Method / code**: fits the existing structure; few general functions, no case-by-case patches.
3. **Visual consistency**: colours, type, buttons from the project's theme and the neighbouring screen.
4. **Correctness of output**: what is drawn, played or produced is checked on real data.
5. **Performance and cost**: no per-frame or per-request work that can be event-driven; name any cost.

Extra checks (they do not block the build; they make you warn the user):

- **Rule gap**: did evaluating or building this need a decision no rule covers, or did the same kind of fix
  repeat? Propose the rule text and where it belongs. Add it only after the user says yes. Sessions report rule
  gaps they hit; you collect them at merge.
- Any extra check the config lists.

## 0. Auto mode (ask once per session)

The first time `/kotar` runs in a session, ask the user one question before anything else (after **First run**
if that ran): "Should I run the board automatically?"

- **Yes:** auto mode is on for the rest of the session. Start every task that step 3 allows as soon as it is
  unblocked, in parallel whenever the files do not overlap (a shared `area` alone does not block), merge each
  finished branch (step 5) and start what it unblocks, without asking or waiting for the user to click a card.
  When the app refuses a start (a turn woken by another session or a background task), propose the card and
  start it on the user's next message, whatever that message says.
- **No:** propose each startable task as a card and wait for the user.
- Either way, a task that needs the user's input (a design question in **Guidance**, `stuck` on a
  decision, an MCP or key) is not started or guessed: leave it, keep going with everything else, and list
  what waits on the user at the end of the report.

## 0b. Watch running sessions (every 5 minutes)

While any board session runs, the orchestrating session checks them every 5 minutes (a recurring `CronCreate`
job, started with the first dispatch and deleted when nothing runs), not only when a session reports:

- `list_sessions` (`linked: true`) for each `running` note's `session`, plus `git log main..refs/heads/<branch>`
  and `git -C <worktree> status --short` for new work.
- **Stuck** means any of: the session is not running and its last report says it waits on a background run, with no
  new commit or file change for 10 minutes; it is running but its last activity is older than 15 minutes; a test run
  hit its timeout twice; or it asks a question nobody answered.
- A stuck session gets one `SendMessage` asking where it stands and telling it to finish the step (rerun the test
  narrower, commit what passes, report). Still stuck at the next check: read its transcript (`list_events`), then
  re-dispatch with the context, or set the note `stuck` with the reason and tell the user.
- Finished but unmerged work found this way goes to step 5 at once. Report changes only; a quiet check says nothing.
- A session that waits long: look at what it does (its processes and how long they run, the worktree's new files)
  and match it to **Known stalls** *(config)* and the general ones below; send that fix in the one
  `SendMessage` instead of a plain "where do you stand". A new cause found this way gets a row in the project's
  `.claude/kotar.md` in the same change.
- Every nudge you send adds 1 to the note's `nudges`; the review (step 5) reads it.

General stalls (any project):

| Sign | Cause | Fix to send |
|---|---|---|
| rebase conflicts at merge | worktree cut from stale `origin/main` | the brief's first step (`git reset --hard refs/heads/main`); a worktree with work already: rebase on `refs/heads/main` |
| one test fails in a full run, passes alone | a known order-dependent or timing flake | rerun it alone; when it passes, report it as the flake instead of debugging it |
| session idle, last message a question | it waits on an answer or a permission | answer a factual question with `SendMessage`; a product question goes to **Guidance** and the user |

## 1. Sync with the board (always first)

- Read both board notes and the frontmatter and **Guidance** section of every note in `Bugs/` and
  `Enhancements/`. Apply what the user wrote there: changed `priority`, added `blockedBy` entries, instructions.
- For each `running` note, look up its `session` with `list_sessions` (`include_archived: true`) and its branch with `git log main..refs/heads/<branch>`:
  - session still running: leave it.
  - session idle with commits reporting finished work: go to step 5 for it.
  - session idle, nothing to show, or gone: read its last report if there is one; set `stuck` with the reason, or re-dispatch if the cause is clearly transient.
- Finish `merge-pending` notes (step 5).

## 2. Sort and record each item

Split the argument into distinct items (one message may hold several). For each, decide its kind yourself:

- **Bug**: something that exists does not work as it should (wrong result, crash, broken layout, regression).
- **Enhancement**: something new, or a change to behaviour that works as built (a feature, a better flow, a new look).

Do a short locate pass first (a few Grep/Glob or code-graph calls, no deep debugging, no fixing here); it often
settles the kind (the code clearly means to do X and does not → bug). When it is still unclear, or the item
could be either and the choice changes the work (a fix of the current behaviour vs. a redesign), ask the user
in one `AskUserQuestion` for all unclear items together, each with a short reason for both readings.
Record the clear items meanwhile. Never guess on an unclear one.

One note per distinct item. Before creating one, check that no open note (in either folder) already covers it;
if one does, add the new detail to that note instead. Pick the area from `Areas/*.md` (each lists its `Paths`)
and fill **Files** from the locate pass. `blockedBy` holds wikilinks (`"[[BUG-003 short-title]]"`) to bugs or
enhancements. Link related notes in the body too, so the graph shows them. Run the list script after creating notes.

**Bug** → `Bugs/BUG-NNN short-title.md`, NNN = highest existing BUG number + 1, zero padded:

```markdown
---
status: new
priority: medium
area: General
size:
branch:
session:
started:
nudges: 0
retries: 0
blockedBy: []
---
# BUG-NNN Short title

Area: [[General]] · Board: [[Bug Board]]

## Symptom
The user's report, in their words. A screenshot they gave: save it next to the note and embed it (`![[BUG-NNN.png]]`).

## Files

## Plan

## Guidance

## Result
```

**Enhancement** → `Enhancements/ENH-NNN short-title.md`, NNN = highest existing ENH number + 1. Evaluate it on
the five checks (read the reference files) and fill **Evaluation**: per check, what it touches, `ok` / what
the build must do; short. If a check needs the user (a design choice, a product decision, assets or keys only
they can give), write the question in **Guidance**, set `status: stuck` with the reason, and tell the user.

```markdown
---
status: new
priority: medium
area: General
size:
branch:
session:
started:
nudges: 0
retries: 0
blockedBy: []
---
# ENH-NNN Short title

Area: [[General]] · Board: [[Enhancement Board]]

## Request
The user's request, in their words (screenshots embedded).

## Evaluation
1. <check 1>:
2. <check 2>:
3. <check 3>:
4. <check 4>:
5. <check 5>:
- <extra checks>:
- Rule gap:

## Files

## Plan

## Guidance

## Result
```

If you later find a note was sorted wrong (a "bug" turns out to be a missing feature, or the other way), move it
to the other folder under the next free number of that kind, keep a link from the old name in **Result**, and say so in the report.

## 2b. Plan each note (before it can start)

A note is not startable until it has a **Plan**. The plan is made here, by you, once; the side session executes it
and does not re-plan. Spend a few minutes, not an investigation:

1. **Prior art.** Look for similar work already done, cheapest source first:
   - the `done` notes: same `area`, or a **Files** entry in common; read their **Result** and **Review**;
   - git history of the likely files: `git log --oneline -n 8 -- <files>`, and for a keyword
     `git log --oneline -i --grep=<word> -n 8`; open at most the two most relevant commits with `git show --stat`;
   - when **Code graph** *(config)* names a tool, use it here (and only here) for the callers and dependents of the
     likely files. Without one, a few Grep calls will do. The side session is not told to walk the graph.
2. **Write the plan** in **Plan** and **Files**:
   - *Scope*: the files to change (exact paths, or a folder), and what is explicitly **out** of scope;
   - *Approach*: 3-5 lines; reuse of existing code or earlier commits named by path or hash; no new abstraction
     unless prior art shows one is needed;
   - *Done when*: checks a person or a test can confirm (a bug: the symptom is gone plus a regression test where the
     logic allows; an enhancement: the five checks hold);
   - *Risks*: shared files, data or saves that could break, callers of shared code;
   - `size`: `S` (one place, under ~20 min), `M` (a few files, ~1 h), `L` (cross-cutting, ~2 h).
     An `L` is split into several notes chained with `blockedBy`, each `S` or `M`, unless it cannot be split (say why).
3. If prior art shows the item is already done or nearly so, say so in **Plan** and tell the user instead of building it again.

## 3. Decide what can start

Go through `new` and `queued` notes in both folders, highest `priority` first; at equal `priority` bugs before
enhancements, then lowest number. A note can start only if all hold:

- it has a **Plan** (step 2b);
- every note in `blockedBy` is `done`;
- no `running` note (either folder) has the same `area`;
- it shares no file in **Files** with a `running` note. Treat the shared files listed in `Bug Board.md`
  ("Conflict rule") as shared across areas, and assume them whenever the work likely touches what they hold
  (enhancements usually do: text, styles, settings, an API or a schema). `docs/*` and board overlap never blocks.

Otherwise set `status: queued` and add the blocking note to `blockedBy`.

Before dispatching, check `git status` on main. Worktrees branch from HEAD, so uncommitted work would be missing
from them. Ignore the board (commit it yourself). If main is dirty with anything else other than a merge you are
finishing, leave the notes `queued` and tell the user what is uncommitted; do not commit their work.

## 4. Dispatch

Re-read the note's **Guidance** right before starting. Load `mcp__ccd_session__start_session` with ToolSearch if needed, then start one session per note: `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`. Set the note to `status: running`, fill `session` with the `local_…` id and `branch` when known, and `started` with the current time (ISO 8601, `date -u +%FT%TZ`).

The brief must stand alone:

- first step, before any edit: `git reset --hard refs/heads/main` in the new worktree (it has no work yet), then confirm
  `git rev-parse HEAD` equals `git rev-parse refs/heads/main`. The app cuts worktrees from `origin/main`, and local
  `main` is never pushed, so without this the branch starts from an old commit and every merge needs a rebase;
- task list: as its very first tool call, together with the `git reset`, call `mcp__ccd_turn__update_plan` with the Plan steps
  (`scope: "first_task"`); then keep it current: `{"advance": true}` rides along with the call that starts each next step, and
  before any command that may run longer than a minute, mark the finished steps done. The user watches this list, so it must
  never lag behind the work;
- the symptom or request, area and any **Guidance** text, and the note's full path (read only);
- the **Plan** and **Files**, copied in full: stay inside the scope, follow the approach, reuse what it names. Do not
  widen the scope and do not go exploring the codebase beyond what the plan needs. If the work cannot be done inside
  the plan, stop, commit what is sound and report why instead of widening it;
- bug: find the root cause in this repo's code; add a regression test where the logic allows it;
- enhancement: the **Evaluation** and the reference files to read (deviate only with a reason in the report); add tests for new logic;
- grep every caller (or use the code graph) before changing shared code;
- **Lessons** (only with **Code graph** `Languages`): run the graph CLI `lessons <every file in Files>` from the main
  checkout and paste its output into the brief as it is: these traps apply to the files the session will change, and
  "used by" names who must keep working. This replaces reading long rules docs for these files;
- **Checks** *(config)*, when there are rows: before the final report, run `node <this skill's directory>/scripts/checks.mjs --note <ID>`
  in the worktree; fix every `FAIL`; list `WARN` and `SLOW` lines in the report (a `SLOW` check was not verified);
- every item in **Brief** *(config)*: project rules files, setup, tests, lint, docs, screenshots;
- commit on the worktree branch; do not merge, push, or edit the board;
- final report, short: the "Done when" items one by one (met / not met), any deviation from the plan and why, root cause (bug) or what changed (enhancement), test/build results, the branch name,
  what only a person can verify; for an enhancement also the five checks redone on the result (one line each) and the extra checks.

If a report asks a product question, put it in the note's **Guidance** and tell the user; answer factual ones yourself with `SendMessage`.

## 5. Merge (when a session reports, or from step 1)

Re-read **Guidance** first: a new instruction there goes back to the session instead of merging. Merge one branch at a time.

1. Set `merge-pending`. Run `node <this skill's directory>/scripts/review.mjs "<note>" <branch>` from the main checkout
   (before merging) and keep its output for step 4. With **Checks** rows, also run `node <this skill's directory>/scripts/checks.mjs --note <ID>`
   with the branch's worktree as working directory (`git worktree list`): a `FAIL` goes back to the session like a failed
   test. Skip a check only when the user says so for this note: `--skip <check>=<their reason>` (it is audited). Read the diff (`git diff main...refs/heads/<branch>`) and check it actually does what the
   note asks and stays in scope; a report is not proof. For an enhancement, re-check the five rules yourself; a
   failed check goes back to the session like a failed test.
2. On main: `git merge --no-ff refs/heads/<branch>`. Resolve `docs/*` and plan/notes-file conflicts yourself. For a code conflict, abort and send it back to the session to rebase on main.
3. Run every check in **Merge** *(config)*. If one fails, add 1 to the note's `retries`, `git reset --hard ORIG_HEAD` (only your own merge, which you just made) and send the failure back to the session.
4. Set `status: done` and write **Result**: root cause or what changed, merge commit, the five checks' result
   (enhancement), what the user should check. Then add a **Review** (below).
   **Lesson** (bug, with **Code graph** `Languages`): when the root cause is a trap the code does not show, add one
   line to the note of the class that holds it, on main: graph CLI `note <Class> "<trap>; <what to check> (<ID>)"`
   (the board's language, max 240 chars). Not a changelog: skip it when the fix explains itself. Commit the board and
   the notes folder.
5. Go back to step 3 and start anything this unblocked.

A note you cannot move forward gets `stuck` with the reason in **Result**.

### Review (after every merge)

Write a short **Review** under **Result**: the `review.mjs` facts (minutes against budget, commits, files outside
the plan, planned files never touched) and the "Done when" items met or not. Then give **warnings** and
**suggestions** from its `flags` (one line each; skip a flag that is not there):

| Flag | Warn | Suggest |
|---|---|---|
| `slow` | took longer than its `size` budget | the plan was too big or vague: split such items next time, or raise `size` earlier |
| `scope-drift` | files outside the plan were changed (list them) | add them to **Files** for this area; if they are shared across areas, add them to "Shared files" in the conflict rule |
| `plan-missed` | none of the planned files were touched | the prior-art search found the wrong place: note what was actually the right file in **Review** |
| `stalled` | needed 2+ nudges | add the cause as a row in **Known stalls** *(config)* |
| `merge-retried` | a merge check failed and went back | add the failing check or its cause to **Brief** *(config)* so sessions run it first |

Checks lines: a `SLOW` check suggests a smaller command or a narrower glob; a `WARN` names what was let through.
When the class's Notlar already held a line about the same trap before this lesson (it came back), propose a
**Checks** row that would catch it, with a fast command and the mode left for the user to choose; add it only on a yes.

Also name one thing that went well or that a later similar note should reuse (a helper, a commit, a test pattern):
future plans find it in step 2b. When the same flag shows up in three `done` notes, propose the permanent fix
(a **Brief** item, a **Known stalls** row, a shared-file entry) to the user in the report; add it only on a yes.


## 6. Report

Reply briefly: each new note with its number and kind (and for an enhancement the evaluation's
notable points), what started, what is queued and on what, what merged, what the user must look at or decide.
Put the extra-check warnings (rule gap and the config's extras) and the **Review** warnings and suggestions of what
just merged in a separate **Warnings** part, so they are not missed. Offer to archive sessions only after their branches are merged, and only act on a yes.

Skipped, timed-out and let-through checks are logged in `<git common dir>/kotar/audit.jsonl`. Do not read it for a
brief or a report; read it only when the user asks what was skipped (filter by note or branch).

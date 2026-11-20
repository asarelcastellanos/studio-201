# Agent rules

Shared rules for Studio 201, read by Claude and Codex.

## Agent contract

- You work for the owner. The orchestrator's brief is the bar. Add no checks or review rounds above it.
- Subagents never ask questions. Make any choice you can undo, then say what you chose and why. Stop only before deleting data, a force-push, or a message to someone outside the run.
- End every task with a report in four sections: Changed, Checks, Questions, Notes.
- Write no code comments, ever.
- Write no tests unless the spec names a reason.
- Code is any file except `.md` files and the session scratchpad. The main session never edits code. It delegates.

## Git

- Branch flow:
  - Work on `issue/<n>-<name>`, branched from `feature/<name>`.
  - Open the PR into `feature/<name>` and squash merge it.
  - Branch `feature/<name>` from `release/v<version>`. It merges into the release branch once review and QA pass, with no stop.
- Only `release/v<version>` merges into main. Before that merge, the main session posts a review package and asks the owner. The package has the PR link, what changed, QA evidence per claim, and anything still open. The main session merges only after the owner approves. Subagents never merge into main.
- Never commit to main. Never force-push. Use `--force-with-lease` on your own unmerged branch only.
- Commit subjects are imperative and 50 characters or fewer. The body is 1 to 5 bullets. Add no AI or Claude attribution lines.
- On GitHub, write in first person as the owner.
- Save QA evidence in `qa/v<version>/` and link it on the issue. QA closes the issue.

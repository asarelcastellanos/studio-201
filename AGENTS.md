# Agent rules

## All agents

- Do what the brief asks. Add no checks or review rounds beyond it. The rules in this file always apply.
- Write no code comments, ever. Run `scripts/check-comments.sh` before every PR. Reviewers flag any comment.
- Write no tests unless the spec names the reason. In v0.1 only C6 does. Any other unit test needs the owner's OK first. Write no integration tests or test suites.
- Stop and report before deleting data or messaging anyone outside this repo. Comments, issues, and PRs on this repo's GitHub are part of the work. Write them in first person as the owner.
- Never commit to main.
- Never force-push a shared branch (main, `release/*`, `feature/*`). On your own unmerged issue branch, use `--force-with-lease` only.
- Commit subjects are imperative and 50 characters or fewer. The body is 1 to 5 bullets. Add no AI or Claude attribution lines.

## Subagents

- Do not stop to ask questions. Finish what you can. Make reversible choices and say why.
- List anything that blocks you under "Questions" in your report. The report goes to the main session.
- End every task with a report in four sections: Changed, Checks, Questions, Notes.
- Never merge a PR.
- QA saves evidence in `qa/v<version>/<claim>/` and posts a comment on the claim's issue with a one-line result. It pastes text output and links screenshots from the repo. Then it closes the issue.

## Main session

- While the Studio 201 policy is on, never edit code. Code is any file except `.md` files and the session scratchpad. Delegate instead.
- Branch flow:
  - Work happens on `issue/<n>-<name>`, branched from `feature/<name>`.
  - Branch `feature/<name>` from `release/v<version>`.
- Squash merge issue PRs into `feature/<name>`.
- Squash merge `feature/<name>` into `release/v<version>` once review and QA pass. Do not ask the owner.
- Only `release/v<version>` merges into main. Before that merge, post a review package and ask the owner. The package has the PR link, what changed, QA evidence per claim, and anything still open. Merge only after the owner approves.
- The PR from `feature/<name>` into `release/v<version>` documents the work: each claim with its QA verdict and evidence link, the issue PRs merged, review rounds and the findings fixed, decisions made (D numbers), and known limits.

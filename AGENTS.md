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

## Writing

These rules apply to replies, docs, commit messages, PR bodies and UI copy.

- Use no em dashes or en dashes. Use a period or a comma. Use straight quotes and sentence-case headings.
- Cut filler and hedges. "In order to" becomes "To". Delete "It is important to note that". "Could potentially" becomes "may".
- Do not use these words: additionally, crucial, delve, pivotal, showcase, testament, vibrant, leverage, utilize. Write "is" or "has", not "serves as" or "boasts".
- Use active voice and name the actor. Write "the loader parses the file", not "the file is parsed".
- Write one idea per sentence. Split any sentence the reader has to reread.
- Say what a thing does, not how it feels. Give the mechanism, the command or the number. If a sentence could appear unchanged in another project's docs, cut it.
- Use the plain word: "use", not "leverage", and "many", not "numerous".
- Write whole sentences with articles and verbs. Spell out arrows and abbreviations.
- Do not force lists of three, and do not write "not just X, but Y".
- Do not open or close with praise or chatbot phrases such as "Great question" or "I hope this helps". Do not add decorative emojis.

## Decisions log

- When you make a conceptual decision or a major assumption that the spec does not cover, append an entry to `docs/decisions.md` before you finish.
- Log a choice between real options, a guess about the owner's intent, or a constraint you assumed but did not verify. Do not log routine implementation detail.
- Use the file's format: a bold "Dnn. Title." line, what was decided, "Why:", "Gave up:" if anything, and "Status:". Write "Status: default" for your own call. Write "Status: agreed" only when the owner approved it.
- Append only. Never rewrite an entry. To change a decision, add a new entry that names the one it replaces.
- A subagent also lists the entry under "Notes" in its report, so the main session sees it.

## Model roles

- Opus runs the main session. It plans, writes briefs and supervises, and it delegates the code.
- Sonnet writes and reviews code. Its agents are `coder`, `ui-builder`, `writer`, `reviewer`, `design-critic`, `researcher` and `qa-runner`.
- Haiku does lookups and mechanical edits. Its agents are `scout` and `mechanic`.
- `scout`, `researcher`, `reviewer` and `design-critic` are read-only and never write files. Each role's file is in `agents/`.

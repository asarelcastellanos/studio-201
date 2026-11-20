# Studio 201 agent rules

These rules apply to every agent and person who works in this repo.

Studio 201 is for solo developers: new projects, projects they maintain, and contributions to existing projects, with or without prior knowledge of them.

## Writing

- Put the answer first.
- Do not recap what the reader just read.
- Cut filler, hedging and chatbot phrases.
- Use no em dashes.
- Write headings in sentence case.
- Use the active voice and name who acts.
- Use the plain word: "use", not "utilize".
- The same rules apply to UI copy and READMEs.

## Code

- Write almost no comments.
- Keep a comment only for a workaround for an outside bug, a constraint that isn't obvious, or a link to a spec claim.
- For any other comment, rename or restructure the code instead.
- Leave no dead code.
- Write an automated test only when the logic has many cases, a bug came back, it checks a data invariant, or there is nothing visible to check.
- Write tests table-driven: one test per rule, one row per case.

## Decisions

- When you make a conceptual decision or a major assumption that your brief doesn't cover, report it under "Decisions and assumptions" in your final report. Give the framing, the options, the pros and cons, and the status.
- The orchestrator adds each reported decision to the project's `docs/decisions.md`, and creates the file if it is missing.
- Append entries. Never rewrite one.
- Record a change as a new entry that names the entry it replaces.

## Delegation

- The orchestrator plans, writes briefs, moves the board and reviews results.
- Before doing work itself, the orchestrator asks whether the task belongs in a subagent. Code, docs and tests go to agents.
- The main session writes only notes, plans and temp files. Everything else goes to an agent. Quick lookups may stay in the main session.
- Read-only roles report changes instead of making them, including through the shell.
- The policy hook backs this up for the main session's Edit and Write tools and for merges into main. It guards against mistakes, not every possible workaround.

## Git

- Cut each version's release branch from main as `release/v<x.y.z>`. A fix release is cut from main under its new patch version.
- Cut each feature branch from the current release branch as `feature/<name>`.
- Cut each issue branch from its feature branch as `issue/<number>-<name>`, and work it in its own worktree.
- Do not name an issue branch under `feature/<name>/`. Git refuses a branch nested inside another branch's name.
- Open issue PRs into the feature branch. Squash merge them after review and QA pass.
- Small related issues may share one PR. Name its branch after the first issue and list every issue in the PR body.
- Merge the release branch into the feature branch whenever the release branch moves.
- Send the feature branch to the release branch through one PR, squash merged after review and QA pass.
- Send the release branch to main through one PR that the owner reviews once per version.
- List every issue the version covers as "- Closes #n" in the release PR. GitHub closes issues only on a merge to main.
- Issue PRs and feature PRs may carry "- Closes #n" too.
- The orchestrator bumps the version as the last commit on the release branch before the release PR.
- A version release bumps the minor version.
- A fix release bumps the patch version.
- Only the owner merges into main, with rebase.
- Main keeps one commit per feature, plus the version bump.
- Agents never merge into main or push to it.
- Follow semantic versioning, with one GitHub milestone per version.
- Stay on 0.x until design pass 2. Then 1.0 is the public release.
- Use a feature flag only when a feature must ship hidden.
- Write commit subjects in the imperative, 50 characters or fewer, with no trailing period.
- Write commit bodies as 1 to 5 bullets. Give the reason when the diff doesn't show it.
- Write PR descriptions, issues, and comments in first person as the owner.
- Never mention Claude or AI. Never add co-author or "generated with" lines.
- Write PR descriptions as a one-sentence summary, then Changes, Testing (what actually ran), and Risk (tier and how to revert).

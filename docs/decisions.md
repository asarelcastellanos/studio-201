# Decisions

Every decision and major assumption, with the reason. Entries are added, never rewritten. A change is a new entry that names the one it replaces.

Format: what was decided, why, and what we gave up. "Status: agreed" means I approved it. "Status: default" means an agent proposed it and I accepted the default without discussion.

## 2026-11-19: Founding decisions

**D1. New repo, separate from claude-workbench.**
Why: start clean so the workbench's earlier choices don't carry over.
Gave up: reusing working code. Some pieces get rebuilt.
Status: agreed.

**D2. Opus 5.5 runs the main session as orchestrator.** Fable 5.2 or Codex give a second opinion when I ask.
Why: the main session plans, writes briefs and supervises. The strongest model is called only when a second opinion is worth the cost.
Status: agreed.

**D3. Sonnet writes and reviews. Haiku does lookups and mechanical edits.**
Why: cost and speed. The main session doesn't write code.
Status: agreed.

**D4. Read-only agents run in parallel. Agents that write work one per task, each in its own git worktree.**
Why: parallel writers make hidden choices that conflict (Cognition, "Don't build multi-agents").
Gave up: some speed on write-heavy work.
Status: agreed.

**D5. Plans are an HTML page for me, with markdown source in the repo for agents.**
Why: long text plans are hard for me to read. Diagrams and decision cards are faster.
Status: agreed.

**D6. Build on existing tools by copying the parts we want, and write our own. No whole third-party plugins.**
Why: whole plugins bring their own triggers and clash with each other.
Gave up: automatic upstream updates. Copied files are tracked by source and commit.
Status: agreed.

**D7. GitHub Issues and one GitHub Project per product are the kanban.** Hooks move cards when agents start and finish.
Why: I oversee agents like a software team. GitHub's board already does the job, so we link to it instead of rebuilding it.
Status: agreed.

**D8. Agents act as me on GitHub and write in first person, as me.** A board field records which agent did the work.
Why: the repos are mine and should read in one voice.
Gave up: GitHub can't enforce my approval, because I can't approve PRs opened under my own account. A hook blocks agents from merging to main instead (D20).
Status: agreed.

**D9. Proof is QA evidence first.** Screenshots, traces and data reports. An automated test is written only when the logic has many cases, a bug came back, it's a data invariant, or there's no screen to check.
Why: tests written by agents tend to mirror the code and pass. Real-app evidence shows it works for a user.
Gave up: a large regression suite. Saved QA scripts re-run before releases instead.
Status: agreed.

**D10. Review and QA are one loop.** Findings become GitHub issues. The coder fixes them, review and QA run again, and only the QA agent closes an issue with new evidence. After 3 rounds, it comes to me.
Status: agreed.

**D11. Specs are numbered claims.** Each claim is one testable sentence tied to my own words, with its proof and assumptions. Idea from PDD Kit (GitHub Next, Proof-Driven Development) and EARS.
Status: agreed.

**D12. Log conceptual decisions and major assumptions** with the framing, options, pros and cons, in this file.
Why: agents make decisions without saying so. I want to see the thinking so I can agree or argue.
Status: agreed.

**D13. Design happens in two passes.** Pass 1 is grayscale wireframes of the screens and architecture, walked through and approved before building. Pass 2 (final color, type, taste) is done by me or a designer at the end, before the public 1.0.
Status: agreed.

**D14. Web default: Tailwind and shadcn/ui.**
Status: agreed.

**D15. Type and color get rules and a check.** Fonts chosen from the subject, at most two families, system fonts on native. Palettes in OKLCH, tinted neutrals, one accent. Contrast at least 4.5:1 for body text and 3:1 for large text and UI parts, checked by a script.
Why: fonts and color are the fastest tells of generated UI.
Status: agreed.

**D16. No Mobbin.** Design references come from a `refs/` folder or URLs Playwright captures.
Why: no paid account.
Status: agreed.

**D17. Writing is short and plain.** Replies, UI copy and READMEs follow unslop plus length rules.
Status: agreed.

**D18. Codex is the second opinion and cross-model reviewer.** It reads `AGENTS.md`, so both models share rules.
Status: agreed.

**D19. Never assume repo visibility.** Every new app asks public or private. Studio 201 is public.
Status: agreed.

**D20. Git flow.** One `feature/<name>` branch per feature. One `issue/<n>-<name>` branch per issue, with its PR squash merged into the feature branch. The feature branch squash merges into main, one commit per feature. Only I merge to main. Small related issues may share one PR. Name its branch after the first issue and list every issue in the PR body.
Why: main stays readable, with one commit per feature. Issue branches can't live under `feature/<name>/` because git refuses a branch nested inside another branch's name.
Status: agreed.

**D21. Semantic versioning, one milestone per version.** 0.x until design pass 2, and 1.0 is the public release. Feature flags only when a feature must ship hidden.
Status: agreed.

**D22. Terminal first. All mods live in one pane docked on the right**, about 20 columns wide, one value per line. It opens with the session on wide terminals, and `/studio` opens it at any width. Nothing above or below the prompt.
Why: width is scarce in the terminal, and height isn't.
Status: agreed.

**D23. Version split: 0.1 is the tools only.** The process skills come in 0.2, and the trial runs the process by hand.
Why: the trial shows which process steps need fixing before we automate them.
Status: agreed.

**D24. License: MIT.**
Status: agreed.

**D25. Audience: solo developers.** Studio 201 is for one person who:
- builds new projects,
- maintains their own,
- contributes to existing projects, with or without prior knowledge of the codebase.

Every doc, skill and agent is written for that person.
Why: this is how I work, and it sets what "done" means. One person approves, reviews and ships, so the tool has to explain itself and keep the overhead low.
Effects: contributing to someone else's repo needs onboarding (learning an unfamiliar codebase) and a mode that follows that project's rules instead of ours. Both are planned for 0.2. Docs assume no team, no designer, and no prior context.
Gave up: team features such as multiple reviewers, roles and permissions.
Status: agreed.

**D26. v0.1 plan approved.** Build order: spike, F5, F1, F3, F2, F4, then install. Decision cards K1 to K10 accepted as recommended. See [plan/v0.1.md](plan/v0.1.md).
Status: agreed.

**D27. `/studio update` runs the update, then tries to reload.** It runs `claude plugin marketplace update` and `claude plugin update -y`, then tries to run `/reload-plugins` for me. If that fails, it prints "Updated to vX. Run /reload-plugins to apply."
Why: `claude plugin update` says a restart is required, and the mod API has no reload call. Running the built-in command from a mod is untested until QA tries it in a live session. Source: spike #23.
Status: default.

**D28. The mod's code is split into files under `src/`.** `hooks/hooks.json` lists one entry file, `"modules": ["./register.tsx"]`. Imports must be static `import` statements.
Why: a test mod split this way passed `claude plugin validate`, `claude plugin test`, and the TypeScript check. Source: spike #23.
Status: default.

**D29. QA evidence for the pane is a text render from `claude plugin test`, saved to a file.** Real screenshots stay a step for me.
Why: the test kit can mount the pane and return its text. A real terminal screenshot needs macOS Screen Recording permission. Source: spike #23.
Status: default.

**D30. Codex reads the shared rules from `~/.codex/AGENTS.md`, plus the repo's `AGENTS.md`.**
Why: the official Codex docs say it reads the global file first, then one file per directory from the repo root down. Source: spike #23.
Status: default.

**D31. Almost no code comments, and a deslop pass before review.** A comment stays only when the code can't say the same thing: a workaround for an outside bug, a constraint that isn't obvious, or a link to a spec claim. Everything else is fixed by renaming or restructuring. Reviewers flag the rest. A deslop skill, adapted from Cursor's team kit and pstack, comes in 0.2 and removes dead code, needless abstraction, defensive checks inside trusted code, and noise comments.
Why: comments drift from the code and pad agent output. Clear names do the same job and stay true.
Status: agreed.

**D32. Read-only roles can't write files through the shell.** The policy refuses shell commands that write files when scout, researcher, reviewer, design-critic or qa-runner runs them. qa-runner may write under `qa/`. C13 now reads "Read-only roles can't edit files, including through shell commands."
Why: reviewers and QA are only independent if they can't change what they check.
Status: agreed.

**D33. One release branch per version.** Each version gets a `release/v<x.y.z>` branch cut from main. A fix release is cut from main under its new patch version. Feature branches come off it, and feature PRs squash merge into it after review and QA. The owner reviews the version once, as a PR from the release branch into main, and merges it with rebase, so main gets one commit per feature. Only the owner merges into main. Replaces the main-merge step of D20.
Why: the owner wants to review a whole version at once instead of each feature, so the build doesn't stop between features.
Gave up: main doesn't get each feature as soon as it's done.
Status: default.

**D34. The main session's shell runs an allowlist.** It may run read tools (ls, cat, grep, find without -delete or -exec, sed without -i, jq and similar), listed git subcommands (status, log, diff, show, add, commit, push, fetch, switch, merge and similar, not checkout, reset, restore, clean, rm, mv or apply), gh, and `claude plugin validate|test|list`. Interpreters, package runners and scripts are refused. In temp dirs it may also rm, cp, mkdir, touch and chmod. Anything else is delegated to an agent.
Why: the review of PR #28 showed that a blocklist of write commands always leaves another way to write a file. An allowlist is harder to get around.
Gave up: the orchestrator can't run one-off scripts itself.
Status: agreed.

**D35. A GitHub ruleset protects main.** Changes reach main only through a PR, with no force pushes and no deletion. Project setup (C8) adds the same ruleset to every product repo.
Why: agents act as my GitHub account, so the policy hook is a guard against mistakes and the ruleset is a second layer GitHub enforces.
Gave up: nothing. I still merge PRs normally.
Status: agreed.

**D36. Tests are table-driven.** One test per rule, with a table of cases. Each row is one line: who runs what, and the expected result.
Why: I want to read a version's tests as a list of rules with examples, not hundreds of named tests.
Status: agreed.

**D37. The policy earns automated tests.** Command matching has many cases, which is one of the four reasons in D9. The plan's line "the one automated test" (C6) is out of date: v0.1 has the policy tests and the forecast test.
Status: default.

**D38. Small policy defaults.** An agent the policy can't find in the agent list counts as a writing role. `gh pr edit --base main` alone is allowed, and only combined with a merge is it refused. The hook is a guard against mistakes, and the ruleset (D35) is the backstop for main.
Status: default.

**D39. A light policy instead of the allowlist.** The main session's Edit and Write on repo files are refused, merges and pushes to main are checked by plain string matching, and delegation is a judgment rule in AGENTS.md. Read-only roles keep their tool lists, and shell writes are an instruction, not a check. Replaces D34 and the shell part of D32.
Why: checking every way a shell command can write a file or reach main turned into an endless list (PR #28, closed). For personal and open-source use, the orchestrator occasionally doing a small thing itself is fine. The ruleset on main (D35) remains the hard line.
Gave up: protection against an agent deliberately working around the check.
Status: agreed.

## Spec assumptions, v0.1

S1 to S9 are listed in [spec/v0.1.md](spec/v0.1.md). Status: default, accepted with the spec on 2026-11-19.

## Pane assumptions, design pass 1

Status: default, accepted with the pane design on 2026-11-19.

| ID | Assumption | For | Against |
|----|------------|-----|---------|
| A1 | The forecast projects recent pace: the last 30 minutes for 5h, the last 24 hours for 7d. | Reacts quickly. | A burst of work can give a false warning. |
| A2 | Usage percent is account-wide, but readings are only taken while a session runs on this Mac. | No background process. | Usage elsewhere shows up in the pace late. |
| A3 | Show the engine's dollar cost estimate. | Comparable across sessions. | On a subscription it isn't what I pay. |
| A4 | All mods in one docked pane, about 20 columns. | The prompt area stays clean. | The pane scrolls with many agents. |
| A5 | Times in Pacific, as real times, not countdowns. | Easy to plan around. | Countdowns are quicker for the 5h window. |
| A6 | The mod records when agents finish, since the engine reports the start time only. | Gives the run time of finished agents. | Agents that finished before the mod loaded show none. |
| A7 | `/studio` opens the pane, because `/agents` is built in. | One command. | None found. |
| A8 | On wide terminals the pane opens with the session. | Same as the old monitor. | Always uses the space. |
| A9 | Each repo stores its board URL in `.studio/config.json`. | No lookup each time. | One more file per repo. |
| A10 | Running agents are ordered longest first. | A stuck agent rises to the top. | The newest work sits lower. |
| A11 | The pane is rebuilt from scratch, keeping the old monitor's layout. The old monitor is turned off at install. | Clean repo. | Rewrites working code. |

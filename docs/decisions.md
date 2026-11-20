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

**D20. Git flow.** One `feature/<name>` branch per feature. One `issue/<n>-<name>` branch per issue, with its PR squash merged into the feature branch. The feature branch squash merges into main, one commit per feature. Only I merge to main.
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

## 2026-11-19: v0.1 restart

**D32. v0.1 restarted from the plan and spike commit (e504145).** The first attempt's branches, PRs and extra issues were removed. Lessons kept: the policy needed several review rounds to fix bypasses and false denies, and scope (the release branch) was added mid-build without a spec change.
Why: a clean start from the approved plan is cheaper than untangling the first attempt.
Status: agreed.

**D33. One release branch per version.** An `issue/<n>-<name>` PR squash merges into `feature/<name>`. A feature that passes review and QA merges into `release/v<version>` with no stop for me. Only the release branch merges into main. Replaces D20's flow.
Why: I review once per version, not once per feature.
Gave up: a stop at every feature.
Status: agreed.

**D34. Merges into main ask me instead of being refused.** Replaces "only I merge to main" in D20 and the hook described in D8. Before merging into main, the main session gives me a review package: the PR link, what changed, QA evidence per claim, and anything still open. The policy hook returns an "ask" permission decision for `gh pr merge` into main, `git push` to main (including refspecs like `HEAD:main`) and `gh api` merge calls, so I see Claude Code's permission prompt. If I approve, it merges. If I decline, nothing happens. A subagent's attempt is refused outright. I approve once per version.
Why: I want to review and approve in the terminal, then let Claude merge.
Gave up: GitHub doesn't enforce it, because the PRs are under my account (D8).
Status: agreed.

**D35. No code comments.** Replaces the first half of D31 ("almost no"). There are no exceptions. A check script fails any change that adds a comment and runs before every PR. The reviewer flags any it finds. The 0.2 deslop skill from D31 stays planned.
Why: comments drift from the code. A rule with exceptions needs a judgment call on every change, and a rule with none needs no judgment.
Status: agreed.

**D36. QA proves each claim in a real session.** Narrows D9. The proof is a screenshot or the command output. The QA runner saves the evidence in `qa/v0.1/`, posts it on the claim's issue as a comment with a one-line result, and closes the issue. Screenshots are linked from the repo, because `gh` can't upload images to comments. Text output is pasted in. A unit test is written only when the spec names the reason, and in v0.1 only C6 does. Any other unit test needs my OK first. There are no integration tests or test suites. Unit tests follow three rules from Matt Pocock's `tdd`. Test at an agreed boundary. Take expected values from the spec or worked examples, not from the code. Mock only outside systems, such as time.
Why: tests written by agents tend to mirror the code and pass (D9). Evidence from a real session shows the claim works.
Gave up: regression coverage beyond C6.
Status: agreed.

**D37. QA closes tickets.** Confirms D10. I don't approve each ticket. I review all the evidence once, at the release-to-main merge.
Why: one review of everything is faster than approving each ticket.
Status: agreed.

**D38. Nine roles.** The check-writer role is folded into coder, because its only v0.1 job is the C6 test. The roles are scout, researcher, reviewer, design-critic, qa-runner, coder, ui-builder, writer and mechanic.
Why: a role with one job in v0.1 doesn't earn its own file.
Status: agreed.

**D39. Role files are modeled on the research sources.** pstack's `worker.md` is the shared contract every role reads first. It is adapted so that agents never ask questions, and the main session asks me at the merge into main. Each role's sources are in [research.md](research.md) under "Role file sources". Every copied or adapted file records its source repo, commit and license in `vendor/SOURCES.md`. Parts of a source that contradict our rules are left out. These are test-first on every ticket (Matt's `tdd` and `implement`), committing to whatever branch is checked out (Matt's `implement`), and pstack's "never ask a person" for the main session.
Why: these sources are used and maintained by others, so the roles start from what has worked instead of from nothing (D6).
Gave up: a role file that follows its source exactly.
Status: agreed.

**D40. F5 builds the minimal plugin frame.** The frame is `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hooks/register.tsx`. F1 adds the marketplace file, install, setup and update on top.
Why: the policy hook can't run without them.
Status: agreed.

**D41. For C14, code is any file except `.md` files and files in the session's scratchpad.**
Why: the first attempt's false denies came from an unclear line.
Status: agreed.

**D42. C13's model check uses each agent's transcript during F5.** The check that the pane shows the right model moves to F2's QA.
Why: the pane doesn't exist until F2.
Status: agreed.

**D43. Chrome Modern Web Guidance is the web reference for ui-builder and design-critic.** It is installed with `DISABLE_TELEMETRY=1` when a web project needs it. Each web project's `AGENTS.md` states a Baseline target, with "Baseline Widely available" as the default. v0.1 itself has no web UI, because the pane is a terminal UI, so this applies to products built with Studio 201.
Why: it gives both roles one current reference for built-in browser features and browser support.
Status: agreed.

**D44. C14 is a habit guard.** It stops an honest main session from editing code by habit. It is not a security boundary. Writes are allowed only to `.md` files, the session scratchpad and `/dev`. The policy refuses the common ways to write a file, including shell redirects, formatters and fixers, interpreters run with `-c`, `-e` or `-r`, and `xargs` wrappers. A variable as a write target is refused, not guessed. Branch operations (switch, merge, rebase, pull, cherry-pick, am and checkout of a branch) are out of scope.
Known limits: variable or substitution indirection, quote tricks such as `$'..'`, running a script file, package scripts (`npm run`, `make`), and installers.
Why: a guard that tries to catch every trick has no end, and it starts denying honest commands.
Status: agreed.

**D45. Ponytail shapes coder, mechanic and reviewer. accessibility-skills is linked, not adapted.** Coder and mechanic take ponytail's smallest-complete-change ladder, and reviewer takes its review order. ui-builder and design-critic link mgifford/accessibility-skills as a reference and copy none of its text.
Why: ponytail is MIT and gives a short rule for the smallest complete change. accessibility-skills is AGPL-3.0, and adapting its text would force our files to AGPL-3.0.
Gave up: accessibility rules in our own words until 0.3.
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

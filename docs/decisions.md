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

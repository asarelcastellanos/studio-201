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

**D46. Install from the local clone right after F1.** Once F5 and F1 are in release/v0.1, I install Studio 201 from my local clone (`claude plugin marketplace add ~/Documents/studio-201`, then `/plugin install studio-201`) after cleaning up ~/.claude myself. F3, F2 and F4 are then built with Studio 201 instead of the workbench. Replaces K10 in plan/v0.1.md.
Why: tests the real install earlier, with Studio 201 guarding its own build.
Gave up: until release/v0.1 reaches main, `/studio update` has nothing new to pull, so I update with `git pull` in the clone.
Status: agreed.

**D47. Setup replaces existing rules, mods and hooks, agents and skills.** After install, Claude always runs on Studio 201, so setup handles whatever was there before. It looks at three groups: rules (`~/.claude/CLAUDE.md` content other than our import line, and a `~/.codex/AGENTS.md` that is not our link), mods and hooks (every entry in `env.CLAUDE_CODE_PLUGIN_DIRS` and the `hooks` key in `settings.json`), and agents and skills (the contents of `~/.claude/agents/`, `skills/` and `commands/`). If it finds none, it installs and asks nothing. If it finds any, it lists them and asks one question with two answers. "Archive it" moves each item to `~/.claude/studio-201/archive/<date-time>/` at the same relative path and writes a `RESTORE.md` that says how to put it back. "Delete it" removes the items for good. Neither answer keeps the old setup active. Dismissing the question changes nothing, and setup asks again next session. Credentials, other settings keys, other plugins, MCP connectors, projects, memory and history are never touched.
Why: Claude must run on Studio 201 after install, so nothing competing stays active.
Gave up: Keeping a personal setup active next to Studio 201.
Replaces the parts of S8 and S9 that kept personal rules and only named two mods.
Status: agreed.

**D48. Board columns and fields.** The Status options are Backlog, Ready, In progress, In review, QA and Done. The fields are Agent (single select: scout, researcher, reviewer, design-critic, qa-runner, coder, ui-builder, writer, mechanic, owner), Type (single select: feature, claim, task) and Version (text).
Why: the spec names "status columns and fields" without listing them. The columns follow the branch flow (review, then QA). The Agent field records who did the work (D8).
Status: default.

**D49. The pane Board link waits for the pane frame.** F3 ships `/board` and the board URL reader. The pane header link wires in with F2's pane frame (C4). C9 (#15) stays open until then.
Why: the plan builds F3 before F2, and there is no pane header yet.
Status: default.

**D50. `/studio update` runs from main or a `release/v*` branch.** It refuses any other branch. C17 and S7 say main only.
Why: under D46 the clone tracks release/v0.1 until the first release merges into main, so a main-only update has nothing to pull.
Gave up: the strict main-only rule until v0.1 reaches main.
Status: default.

**D51. `/studio update` prints a reload hint instead of trying `/reload-plugins`.** Replaces the reload attempt in D27.
Why: a mod cannot reload itself in the middle of its own command. The F1 review removed the attempt (PR #56).
Status: default.

**D52. The update tool asks before it runs, refreshes the rules copy without a version bump, and holds a lock.** The `studio_update` tool asks the owner first. It refreshes `~/.claude/studio-201/AGENTS.md` even when the plugin version did not change. A lock across sessions stops two updates from running at once.
Why: an update changes ~/.claude. Rules edits often ship without a version bump. Two sessions updating at once can leave a half-written copy.
Status: default.

**D53. Read-only roles cannot write through Bash, and the policy toggle does not change that.** scout, researcher, reviewer and design-critic are refused Bash writes even when `/studio policy` is off. Extends D44, which covers the main session only.
Why: AGENTS.md says these roles never write files. The toggle is for the main session's habit guard, not for role limits.
Status: default.

**D54. The comment check skips `docs/` and a shebang on line 1, and works line by line.** Replaces "no exceptions" in D35 for these cases. It does not parse code, so a `#` or `//` inside a string on its own line can be miscounted (the limits listed in PR #46).
Why: docs are prose, and a shebang is required to run a script. A line check is short and catches every comment an agent writes by habit.
Gave up: a parser per language.
Status: default.

**D55. The merge-into-main prompt ignores `/studio policy`, and an unknown branch counts as main.** The prompt runs even with the policy off. If the branch lookup fails, the merge is treated as a merge into main and asks. PR #52 cited D34 for the first part, but D34 does not say it.
Why: merging into main is the step the owner asked to approve every time (C15). Asking by mistake costs one answer, and skipping by mistake could merge unreviewed work.
Status: default.

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

**D70. The Type field is named Kind.** GitHub reserves the field name Type, so createProjectV2Field fails. The board field is Kind, with the same options (feature, claim, task). This changes the name in D48. On a reused project, the script creates Agent, Kind and Version only if missing and never replaces the options of an existing field. If options are missing it prints one line naming them.
Why: Kind has the same purpose, and reusing a project must not reset item values.
Gave up: the name Type.
Status: default.

**D71. The project lookup prefers a project linked to the repo.** The script first reads the projects linked to the repo. If exactly one is linked, it reuses it. If several are linked, it uses the one whose title matches the repo name when spaces, hyphens and case are ignored. If none or several match, it stops and lists the linked projects. If none is linked, it falls back to the project whose title equals the repo name, then creates one.
Why: the repo already had the project "Studio 201" linked, and the exact title match created a second board.
Status: default.

## Forecast, issue #12

**D60. Unit tests run with `node --test` and Node's built-in TypeScript type stripping.** The repo had no test runner, no `package.json` and no build step. The test imports `../src/forecast.ts` with the extension. The command is `node --test tests/forecast.test.ts`.
Why: it adds no dependency and no build step, and C6 needs one test file.
Gave up: a runner such as vitest, and extensionless imports in this file.
Status: default.

**D61. The forecast needs at least 3 readings inside the window span.** Fewer than 3, or readings that all share one time, return "not enough data" (C7). A reading at 100% or more needs no fit, so it counts as a hit at that reading's time even with fewer than 3.
Why: two points always make a perfect line, so 3 is the smallest count that shows a trend. A 100% reading is a fact, not a projection.
Gave up: a longer minimum, which would delay the first forecast.
Status: default.

**D62. A forecast that lands exactly on the reset time counts as "pace is fine".** The forecast time must be strictly before the reset. A fitted time earlier than now is moved to now.
Why: at the reset the window empties, so 100% is never held.
Status: default.

**D63. The Pacific time format is "Sat Nov 21, 12:10 AM PST", with the zone abbreviation.** The formatter uses `Intl.DateTimeFormat` with `America/Los_Angeles`.
Why: A5 asks for day, date and time. The abbreviation tells PST from PDT on 1 November, when 1:10 AM happens twice.
Status: default.

## Pane frame, issue #10

**D56. Tokens used sums all four counts, cache reads included.** Input, output, cache read and cache creation tokens from each turn's usage all add up.
Why: it matches the total the engine reports per turn, and it shows how much the session moved, not only what it billed at full rate.
Gave up: a smaller number that leaves out cache reads.
Status: default.

**D57. Tokens by model reset when the mod reloads.** The engine has no whole-session tokens-by-model call, so the mod adds up `turn.complete` usage in memory, subagent turns included. A reload or a resumed session starts the totals at zero.
Why: C4 does not ask for history, and storing totals would need a session id the mod does not have.
Gave up: totals that survive a reload.
Status: default.

**D58. The Board slot draws nothing until C9 fills it.** The pane header has a slot for the Board link and passes nothing to it yet.
Why: D49 puts the Board link in the header, and C9 owns the link.
Status: default.

**D59. The policy block shows on or off and tokens by model, without the design's role lines.** The design lists which model plays main and agents. The pane leaves those lines out, and the engine draws the close control, so the design's "×" is dropped too.
Why: C4 asks for whether the policy is on and tokens by model. No call tells the mod each role's model.
Gave up: the role lines in the Policy block.
Status: default.

**D72. The pane shows the session start time, not elapsed time.** The line reads "since 10:02 AM" in Pacific time. The elapsed value is gone.
Why: the engine has no timer, and the pane redraws only on `turn.complete`, so an elapsed value goes stale between turns. A start time never does. The pane also redraws on every `turn.complete`, including turns with no usage.
Gave up: a running elapsed value, or one labelled with its last update.
Status: default.

**D73. Token totals reset when `startedAt` changes, and the lines say "since load".** The mod compares `usage.startedAt` with the last value it saw and clears the totals on a change, which a `/clear` causes. After a resume or reload the totals still start at zero, so the label says they count from when the pane loaded. This refines D57.
Why: the engine has no whole-session tokens-by-model call, and cost and start time count from the session start.
Gave up: totals that match cost after a resume.
Status: default.

**D74. The context figure comes from the /context breakdown.** The pane asks `$.session.usage({ breakdown: 'summary' })` and shows `totalTokens`, `rawMaxTokens` and `percentage`, so the percent matches /context. It falls back to the status-line figures when the breakdown is absent. The `summary` detail estimates locally and sends no token-count requests.
Why: QA compares the pane with /context, which measures against the compaction window.
Gave up: the exact token counts of the `full` detail.
Status: default.

**D75. Usage readings persist in the plugin store, capped to 7 days.** Each `turn.complete` reads `rateLimits` and appends one reading per window to `$.store` under the key `readings`. Readings older than 7 days are dropped on each write. The pane reads them back on every draw. The store is a JSON file kept between sessions and reloads, so the 7-day forecast keeps its 24 hours of history.
Why: A1 needs 24 hours of history for 7d, and in-memory readings would be lost on every reload.
Gave up: readings that are exact per session. The store is shared by every session of the plugin, and two sessions finishing a turn at once may drop one reading.
Status: default.

**D76. A drop in percent clears that window's readings.** If a new reading is lower than the last one, the window has reset, so the mod keeps only the new reading. The forecast function fits one straight line, and readings from before a reset would give it a false downward slope.
Why: usage inside a window only rises, so a drop means a reset, and the forecast needs no change.
Gave up: forecasts right after a reset, which show "not enough readings" until three new readings arrive.
Status: default.

**D77. Pane times are "Fri 11/20" and "2:00 PM PT" on two lines.** The pane does not use `formatPacific`, which is 26 characters wide. The day and date line comes from `formatDay` in `src/usage.ts`, the time from `formatClock`, and the pane adds "PT". A window with no `resetsAt` shows no reset line and no forecast.
Why: the pane is 20 columns wide, and the design page wraps its times the same way.
Gave up: the zone abbreviation PST or PDT, which "PT" replaces.
Status: default.

**D78. A change in resetsAt clears that window's readings.** Each stored reading carries the window's `resetsAt`. A new reading clears the window's history only when its `resetsAt` differs from the last stored one. A dip in percent with the same `resetsAt` keeps the history. This replaces D76.
Why: a 0.1 dip after 24 rising 7d readings wiped the history and dropped the forecast to not-enough-data, while the reset time is the signal the API gives for a new window.
Gave up: detecting a reset when `resetsAt` is missing. Such readings are appended and never clear the history.
Status: default.

**D79. Pane token figures count conversation turns only.** The tokens line and the per-model rows sum `turn.complete` usage since the pane loaded. They do not match `/cost`, which also counts compaction, summaries and helper calls such as the auto-mode classifier. The pane labels them "chat" and "chat tokens". Cost, from `$.session.usage().cost`, is the figure that covers everything. C4 passes on model, cost and context matching `/cost` and `/context`.
Why: the engine exposes no per-model session total, and compaction, summaries and helper calls never reach `turn.complete`.
Gave up: token figures that match `/cost`.
Status: agreed (owner approved on 2026-11-20).

**D80. The 7d percent can differ from /usage by one point when the reading is stale.** The pane rounds to nearest and shows the reading from the last response. `/usage` fetches a fresh reading, so the two differ by one point only when the pane's reading is stale.
Why: the engine delivers rate limits with each response, not on demand.
Gave up: an exact match with `/usage` between responses.
Status: agreed (owner approved on 2026-11-20).

## Board link, issue #15

**D81. The pane Board link is a `Link` labelled "Board", and it shows nothing without a board.** The pane reads the URL with the same `readBoardUrl` call as `/board`, on every draw. With no `.studio/config.json` or no board URL, the header slot stays empty. The pane shows no hint and no error. This fills the slot D58 left empty and completes D49.
Why: `Link` draws an OSC 8 hyperlink on the terminal, and the pane is 20 columns wide, so a dim hint line would crowd the header. `/board` already prints the setup hint.
Gave up: a hint in the pane for a repo with no board.
Status: default.

**D90. "Top 5" means the 5 longest-running agents.** The Agents section orders running agents by start time, oldest first, and breaks ties by id. This applies A10.
Why: a stuck agent rises to the top, and the order does not change while agents run.
Gave up: newest first, which puts fresh work on top but buries a stuck agent.
Status: default.

**D91. Running agents show their start time, not run time.** The line reads "since 2:04 PM" in Pacific time, like the session line in D72. Finished agents show "ran 6m 02s", which never changes.
Why: the pane redraws on agent start, stop and turn events only, so a running timer would go stale between them.
Gave up: a live run time for running agents, which C10 names.
Status: default.

**D92. The mod keeps its own list of finished agents.** On `classic.SubagentStop`, and at each draw, the mod copies any agent with status completed, failed or killed into memory, with the time it first saw it as the end time. `$.agent.list()` drops a finished agent seconds later. The list resets on reload, so agents that finished before the mod loaded never appear (A6). Opening "N finished" shows every finished agent, newest first, and finished rows are not clickable.
Why: AgentInfo has a start time but no end time, and the engine drops the agent soon after it ends.
Gave up: the design page's "Show 9 more" under the finished list, and viewing a finished agent's transcript.
Status: default.

**D93. Clicking an agent calls `$.ui.view`, and only the role line is the button.** The engine's own view shows the agent's transcript, so the mod draws no transcript. A `Button` takes one line of text, so the task, model, start and tokens lines are plain text. While an agent is in view (`e.props.view.agentId`), the pane shows "‹ Back to main" at the top and marks that agent with "●". The two open or closed states reset to closed each time the pane opens.
Why: the engine supports the view and the way back, and a Button cannot hold several lines.
Gave up: a click target over the whole agent entry.
Status: default.

**D94. The mod keeps the newest 50 finished agents.** When the mod adds a finished agent, it drops the oldest entries by end time until 50 remain. "N finished" counts the agents kept. Opening it shows the newest 5, and "Show N more ›" and "Show fewer ‹" expand and collapse the rest, as in the running list. This changes D92, which showed every finished agent.
Why: the list is module-level memory and grew without bound.
Gave up: showing every finished agent in a session, and the design page's "Show 9 more" wording.
Status: default.

**D95. D91 agreed.** The owner approved the start time for running agents on 2026-11-20, so C10's run time is met by the start time.
Status: agreed.

**D96. The pane has three layouts, chosen by the pane's body width.** The engine gives a Pane `bodyColumns` in `e.props`, the cells inside its frame. Under 32 columns is narrow and keeps the stacked layout of D91 to D93. From 32 to 47 is medium, and 48 and over is wide. Medium and wide join short parts with " · " and start a new line when the next part does not fit. Wide puts a running or finished agent on one line when the task keeps at least 12 characters, and cuts the task with "…". Otherwise the agent uses the medium layout. Limit and context bars grow by 1 cell for every 4 columns past 48, up to 6 cells. A missing `bodyColumns` counts as narrow. The Board link text is "Board" and the href is the URL.
Why: 32 fits "resets Mon 11/23 2:00 PM PT" (27) with room to spare. 48 fits "7d ████████ 42% · resets Mon 11/23 2:00 PM PT" (45). A one-line agent row such as "Scout · Sleep then list /usr/bin · Haiku 5.5 · since 2:08 PM · 22.6k" takes 68 columns, so below about 60 most agent rows use the medium layout.
Gave up: a fixed one-line agent row at 48 columns, which would cut most tasks to a few characters.
Status: default.

**D97. The Board header is a Button that opens the URL.** The engine's `Link` prints its text and then the URL in dim on terminals without OSC 8, and `LinkProps` cannot turn that off. That widened the pane to the length of the URL. The header now shows a plain `Button` labelled "Board". Pressing it runs `$.process.run(['open', url])` when `$.session.info()` reports `macos`, and `xdg-open` on any other platform. If the command fails or exits with a code other than 0, the pane shows a toast "Board: <url>". `/board` still prints the URL. This replaces the Link part of D81 and D96.
Why: a Button is one short line on every terminal, and the URL stays reachable from the toast and `/board`.
Gave up: a clickable link on terminals that support OSC 8, and `start` on Windows.
Status: default.

**D98. An agent is finished only when its status says it ended.** The mod no longer adds an agent to the finished list when `classic.SubagentStop` fires. An agent counts as finished only when `$.agent.list()` reports status completed, failed or killed. An agent whose status is waiting or idle stays in the running list. An agent already in the finished list that the list reports in any other status moves back to running, because the engine says a message may resume an ended agent under the same id. The pane also redraws when an agent's turn starts, which is when a finished background shell wakes an agent. This changes D92.
Why: `AgentInfo` has no field for an agent's shells. Its `waiting` status is documented as waiting on background work the agent owns, and `SubagentStop` fires when a turn ends, not when the shells end. `SubagentStopHookInput.background_tasks` lists the session's in-flight work, not one agent's, so it cannot say which agent a shell belongs to. Forcing the stopped id into the finished list marked agents the Claude Code footer shows as waiting on a shell.
Gave up: an agent whose status is completed while a shell still runs would show as finished. The types give no way to tell, so the mod trusts the status.
Status: default.

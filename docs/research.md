# Research

The sources studied on 2026-11-19 and what Studio 201 takes from each. Read before copying anything, and record the source commit and license in `vendor/SOURCES.md` when a file is copied.

## Orchestration

| Source | What we take |
|--------|--------------|
| [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/harness/pstack/claude-code) | `worker.md`, a short contract every agent reads first. `interrogate`: a finding survives only with a repro. `correct`: turn a repeated mistake into a check. `blast-radius`: a confidence ladder. `create-verification-skill`: a per-app skill that drives the app. |
| [cursor/plugins advisor](https://github.com/cursor/plugins/tree/main/advisor) | A stop hook that blocks "done" until a check has run, with a loop limit of 3. |
| [obra/superpowers](https://github.com/obra/superpowers) | A fresh agent per task. Review checks the spec first, then quality. A hook reloads skills after compaction, or they stop triggering. |
| [HumanLayer ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) | Research, plan, implement. Review the plan, not the code. Write status back into the plan after each phase. |
| [Cognition, "Don't build multi-agents"](https://cognition.com/blog/dont-build-multi-agents) | Parallel writers make conflicting hidden choices. Share decisions, not just tasks. |
| [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Briefs need an objective, an output format and boundaries. Multi-agent runs use about 15x the tokens of chat, so small tasks get no subagents. |
| [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents) | Subagents don't see the conversation. Frontmatter: `tools`, `model`, `isolation: worktree`, `skills`. |
| [Every, compound engineering](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents) | Record a lesson after every change. |
| [Amp oracle](https://ampcode.com/news/oracle) | A stronger model as a read-only second opinion, called on purpose. |
| [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer) | Plans as HTML pages with diagrams and decision cards. |
| [mattpocock/skills](https://github.com/mattpocock/skills), MIT | `implement`: build what was decided, never reopen the plan. `code-review`: two checks, standards and spec, and each finding cites the rule or the spec line. `writing-for-agents`: the no-op test. Delete a line, and if behavior doesn't change it goes. `to-tickets`: blocking links between tickets. `tdd`: quality rules for the rare unit test. Skipped: test-first on every ticket, committing to the current branch, and `grill-me` and `to-spec` (0.2 process work). |
| [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail), MIT | The smallest-complete-change ladder: does it need to exist, is it in the codebase, does the standard library or platform do it, does an installed dependency do it, can it be one line, then the minimum code. Finish every caller, test and fixture the change breaks. Grep every caller before a bug fix. Moved code keeps its error handling. Never cut validation, data-loss handling, security or accessibility. For review: the priority order (correct, safe, holds under load, tested, fast, lean), callers of every changed function, scale judged against the repo's expected load, and a check for code that can be deleted. Skipped: "comment only the why" and the `shortcut:` comment, because D35 allows no comments, and the self-check for new logic, because D36 allows no unrequested tests. |

## Specs and QA

| Source | What we take |
|--------|--------------|
| [PDD Kit](https://githubnext.com/projects/pdd-kit/) | Proof-Driven Development (Rust and Verus only). We take three ideas: trace each claim to the user's words, list what is assumed, and finish with a receipt PR. |
| [github/spec-kit](https://github.com/github/spec-kit) | A per-project principles file. |
| [Kiro specs](https://kiro.dev/docs/specs/) | EARS sentence templates for requirements. |

## Design

| Source | What we take |
|--------|--------------|
| [Anthropic frontend-design](https://github.com/anthropics/skills) | Plan the direction first, then check it against the generic default. |
| [Impeccable](https://github.com/pbakaus/impeccable) | `craft-floor.md`, a list of things to refuse. `ios.md`. The `detect` CLI as a check. Live mode skipped, because it can launch an agent with permissions bypassed. |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Accessibility, focus, forms and motion rules for review. |
| [Emil Kowalski skills](https://github.com/emilkowalski/skills) | Detail and motion cheatsheet, and `learn-taste`. |
| [twostraws SwiftUI-Agent-Skill](https://github.com/twostraws/SwiftUI-Agent-Skill) | SwiftUI correctness. |
| [AvdLee swiftui-agent-skill](https://github.com/AvdLee/swiftui-agent-skill) | SwiftUI, including Liquid Glass. Not yet read. |
| [microsoft/win-dev-skills](https://github.com/microsoft/win-dev-skills) | WinUI and Fluent. Not yet read. |
| [Radix Colors](https://www.radix-ui.com/colors), Adobe Leonardo | Palettes with contrast built in. |
| [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance), Apache-2.0 code and CC-BY 4.0 guides | Prefer built-in browser features over JavaScript. Set a Baseline target per web project. Load fallbacks only when needed. Use `legacy-scan` as a check. Telemetry is on by default, so install with `DISABLE_TELEMETRY=1`. |
| [mgifford/accessibility-skills](https://github.com/mgifford/accessibility-skills), AGPL-3.0 | Linked only, not adapted. AGPL-3.0 is incompatible with this MIT repo, so ui-builder and design-critic point to it as a reference for forms, keyboard, contrast and live regions. An accessibility role is planned for 0.3. |

## Catalogs

- [skills.sh](https://www.skills.sh/): `npx skills add owner/repo`. The rankings follow install counts, not quality.
- [AI SDK llms.txt](https://ai-sdk.dev/llms.txt): link from web projects that use the AI SDK.

## Role file sources

| Role | Modeled on |
|------|------------|
| All roles (shared contract) | pstack `worker.md`, plus Anthropic's brief rule (objective, output format, boundaries) |
| coder | superpowers `implementer-prompt.md`, Matt `implement` (don't reopen the plan), pstack subtract-before-you-add and boundary-discipline, Matt `tdd` quality rules for C6 only, ponytail (smallest complete change) |
| mechanic | superpowers `implementer-prompt.md`, narrowed to edits the brief spells out, ponytail (finish every caller, keep moved code's validation) |
| reviewer | Matt `code-review` (standards and spec checks), superpowers `code-reviewer.md`, pstack `interrogate` (a finding needs a repro), pstack `comment-sicko` (with no exceptions), ponytail-review (priority order, callers, load, deletions) |
| qa-runner | pstack `create-verification-skill` and `prove-it-works` |
| scout | pstack `how` and `why` |
| researcher | Anthropic multi-agent research system, pstack `figure-it-out` |
| writer | pstack `technical-writing` and `unslop`, Matt `writing-for-agents` |
| ui-builder | Anthropic frontend-design, Impeccable `craft-floor.md`, Vercel Web Interface Guidelines, Chrome Modern Web Guidance, a link to mgifford/accessibility-skills (not adapted) |
| design-critic | Impeccable `craft-floor.md` and `detect`, Vercel Web Interface Guidelines, Emil Kowalski skills, Modern Web Guidance `legacy-scan`, a link to mgifford/accessibility-skills (not adapted) |

What each role takes is decided when its file is written. Parts that contradict our rules are left out (D39).

## Unverified

These came from agent knowledge, not from pages read: mutation testing tools, the pandera, pointblank and FlaUI details, and the Microsoft and AvdLee skills. Check them before relying on them.

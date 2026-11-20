# Studio 201

An agent team for Claude Code. You're the manager: an Opus orchestrator plans and hands work to specialist agents, and a GitHub board shows every task.

Status: building v0.1. Not installable yet.

## Who it's for

Solo developers, working on:

- a new project from scratch,
- a project they already maintain,
- an existing project they want to contribute to, whether they know the codebase or are seeing it for the first time.

Every skill, agent and doc is written for one person doing the whole job with a team of agents.

## How it works

- You approve the spec, the plan, and every merge to main.
- The orchestrator (Opus 5.5) plans, writes briefs, and moves cards on the board.
- Agents on Sonnet and Haiku research, build, review, and run QA, each on its own branch.
- Proof is QA evidence: screenshots, traces, data reports. A test gets written only when there's a reason for it.
- A side pane in the terminal shows session cost, usage limits with a forecast, and running agents.

## Roadmap

| Version | Adds |
|---------|------|
| 0.1 | Install and update, side pane, board setup, agent team, guardrails |
| 0.2 | Process skills: spec, plan page, review and QA loop, receipt PRs |
| 0.3 | Design: DESIGN.md, type and color, Tailwind + shadcn/ui, Apple and Windows rules |
| 0.4 | Codex second opinion, voice check, inbox and evidence |
| 1.0 | Final design pass and public release |

Details in [ROADMAP.md](ROADMAP.md).

## Install

Run this in a Claude Code terminal session. Answer `y` to add the marketplace, then pick a scope.

    /plugin install studio-201 --marketplace asarelcastellanos/studio-201

The first session after install asks once before it changes anything. If you say yes, it copies `AGENTS.md` to `~/.claude/studio-201/`, adds one import line to `~/.claude/CLAUDE.md`, links `~/.codex/AGENTS.md` when Codex is set up, and turns off the claude-workbench monitor and model-policy plugins. `/studio setup` runs it again.

To pull the latest version on any Mac:

    /studio update

## Docs

- [Spec v0.1](docs/spec/v0.1.md)
- [Plan v0.1](docs/plan/v0.1.md)
- [Decisions](docs/decisions.md)
- [Research](docs/research.md)
- [Blueprint](docs/blueprint.html) and [pane design, pass 1](docs/design/pane-pass-1.html). These are HTML pages. Download and open them in a browser.

## License

MIT

# Studio 201

An agent team for Claude Code. You're the manager: an Opus orchestrator plans and hands work to specialist agents, and a GitHub board shows every task.

Status: building v0.1. It installs from a local clone.

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

You need Claude Code on a Mac. Studio 201 installs from a local clone of this repo. Run these two commands with the path of your clone:

    claude plugin marketplace add ~/Documents/studio-201
    claude plugin install studio-201

Inside a Claude Code session, the second command is `/plugin install studio-201`.

When the repo is public, one command installs it from GitHub:

    /plugin install studio-201 --marketplace asarelcastellanos/studio-201

### What setup changes

The first interactive session after install runs setup. It lists every change and asks once before it touches anything. If you say no, it changes nothing and does not ask again. Type `/studio setup` to run it later.

Setup does four things:

- Copies `AGENTS.md` to `~/.claude/studio-201/AGENTS.md`.
- Adds one import line to `~/.claude/CLAUDE.md`: `@` followed by the absolute path of that copy. It creates the file if it is missing and never adds the line twice.
- Links `~/.codex/AGENTS.md` to that copy so Codex reads the same rules. If `~/.codex/AGENTS.md` already exists and is not that link, setup leaves it alone and says so. If `~/.codex` does not exist, setup skips Codex.
- Turns off the claude-workbench mods `model-policy`, `session-monitor` and `session-coach`. It removes them from `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` and removes the claude-workbench import line from `~/.claude/CLAUDE.md`. The workbench stays on disk.

Setup backs up each file it edits as `<file>.studio-201.bak` before the edit. It keeps the first backup if one exists. If `CLAUDE_CONFIG_DIR` is set, setup uses that folder instead of `~/.claude`. Restart Claude Code after setup so it loads the rules.

`/studio update` pulls the latest version on any Mac. It arrives later in 0.1.

## Docs

- [Spec v0.1](docs/spec/v0.1.md)
- [Plan v0.1](docs/plan/v0.1.md)
- [Decisions](docs/decisions.md)
- [Research](docs/research.md)
- [Blueprint](docs/blueprint.html) and [pane design, pass 1](docs/design/pane-pass-1.html). These are HTML pages. Download and open them in a browser.

## License

MIT

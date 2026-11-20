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

## Update

Type `/studio update`, or ask Claude to update Studio 201. Claude calls the `studio_update` tool, which runs the same steps:

1. It reads the installed version.
2. If the Studio 201 marketplace is a local clone, it runs `git pull --ff-only` in that clone and reports the branch and the result. If the pull fails, because the clone has local commits that diverge from upstream or changes that conflict, the update stops before it changes anything and says why. Fix the clone and run it again.
3. It runs `claude plugin marketplace update studio-201` and `claude plugin update studio-201@studio-201`.
4. If setup has run, it refreshes `~/.claude/studio-201/AGENTS.md` from the updated plugin. It touches no other personal file.
5. It reports `Updated vOLD to vNEW. Run /reload-plugins to apply.`, or `Studio 201 is up to date (vX).` when nothing changed.

Each command and its output go to the session log. An error stops the update and is shown as it happened. A clone installed from a local path is the case in step 2. A marketplace added from GitHub has no clone to pull, so the update skips step 2 and the marketplace update fetches the latest version.

After the update, Studio 201 asks Claude Code to reload plugins. If the reload does not happen, run `/reload-plugins` to load the new version. Without a reload, the new version loads at the next session start.

## Docs

- [Spec v0.1](docs/spec/v0.1.md)
- [Plan v0.1](docs/plan/v0.1.md)
- [Decisions](docs/decisions.md)
- [Research](docs/research.md)
- [Blueprint](docs/blueprint.html) and [pane design, pass 1](docs/design/pane-pass-1.html). These are HTML pages. Download and open them in a browser.

## License

MIT

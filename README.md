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

After install, Claude runs on Studio 201. The first interactive session runs setup, which handles whatever was there before. It looks for three groups:

- Rules: anything in `~/.claude/CLAUDE.md` other than the Studio 201 import line, and a `~/.codex/AGENTS.md` that is not the Studio 201 link.
- Mods and hooks: every entry in `env.CLAUDE_CODE_PLUGIN_DIRS` and the `hooks` key in `~/.claude/settings.json`.
- Agents and skills: everything in `~/.claude/agents/`, `~/.claude/skills/` and `~/.claude/commands/`.

If it finds none of these, it installs and asks nothing. If it finds any, it lists them and asks one question with two answers:

- Archive it moves each item to `~/.claude/studio-201/archive/<date-time>/`, keeps its relative path, and writes a `RESTORE.md` that says what moved from where and how to put it back.
- Delete it removes the items for good.

Neither answer keeps the old setup active. If you dismiss the question, setup changes nothing and asks again next session. Type `/studio setup` to run it on demand.

Then setup installs Studio 201:

- Copies `AGENTS.md` to `~/.claude/studio-201/AGENTS.md`.
- Makes `~/.claude/CLAUDE.md` only one import line: `@` followed by the absolute path of that copy.
- Links `~/.codex/AGENTS.md` to that copy, if `~/.codex` exists.
- Removes the old mods and hooks from `settings.json` and keeps every other key.

Credentials, other settings keys, other plugins, MCP connectors, projects, memory and history are never touched. If `CLAUDE_CONFIG_DIR` is set, setup uses that folder instead of `~/.claude`.

Setup checks that `settings.json` is strict JSON before it changes anything. If the file has a comment or a trailing comma, setup stops and changes nothing. After you fix the file, run `/studio setup`. Setup writes each file through a temporary file and a rename, and keeps line endings as they were. If a step fails, it reports what was already done and where the archive is. Restart Claude Code after setup so it loads the rules.

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

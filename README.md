# Studio 201

Global rules, modes and tools for working with Claude Code and Codex.

## What is here

| Path | What it is |
| --- | --- |
| `global/AGENTS.md` | Rules that apply in every repo and session, for Claude Code and Codex |
| `plugins/studio-pane/` | A Claude Code side pane with session info and usage limits |

Modes, such as Studio mode for feature work, come later. With no mode on, Claude Code and Codex work as general assistants.

## Install the global rules

Claude Code reads `~/.claude/CLAUDE.md`. Make it import the rules:

```
@/path/to/studio-201/global/AGENTS.md
```

Codex reads `~/.codex/AGENTS.md`. Link it to the same file:

```
ln -s /path/to/studio-201/global/AGENTS.md ~/.codex/AGENTS.md
```

## Install the side pane

```
/plugin marketplace add asarelcastellanos/studio-201
/plugin install studio-pane@studio-201
```

The pane opens beside the chat in a terminal at least 144 columns wide. Type `/studio` to open it at any width.

```
── Session ──────────────────────
 Context  ████████░░ 38% [Compact]
 Model    Opus 5.5
 Repo     studio-201
 Branch   main
 Folder   ~/Documents/studio-201
 Mode     none

▸ Claude ── 5h 22% · 7d 31% ─────
▸ Codex ─── 5h 6% · 7d 3% ───────
```

| Part | Source |
| --- | --- |
| Context, model, repo, folder | The Claude Code session |
| Branch | `git branch --show-current` |
| Claude 5h and 7d limits | The Claude Code session |
| Codex 5h and 7d limits | The newest Codex session logs in `~/.codex/sessions` |
| Cost (at API price), 5h | Tokens in Claude transcripts and Codex logs from the current 5h window, priced at published API rates |
| Pace | A straight line through recent readings, shown only when a window would run out before it resets |

The Codex section shows only when a Codex log was written in the last 5 hours. Each section header opens and closes with a click and remembers its state.

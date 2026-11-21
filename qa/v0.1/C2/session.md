# C2 QA session: shared rules in AGENTS.md, CLAUDE.md imports it

Verdict: PASS. Claude and Codex both answered all three rule questions from AGENTS.md, without being told where the rules live.

## Setup

- Copy: `git archive HEAD` of the issue-7 worktree, extracted to `/private/tmp/claude-501/qa-c2`, then `git init` and one commit so both tools see a repo root.
- `CLAUDE.md` contains one line: `@AGENTS.md`.
- Claude: `env -u CLAUDE_CODE_PLUGIN_DIRS claude -p --setting-sources project "<q>"` (run with `--output-format stream-json --verbose` to capture tool calls). One session per question.
- Codex (codex-cli 0.169.0): `codex exec -s read-only --json "<q>"`. One session per question.
- `--setting-sources project` still loads the project `CLAUDE.md`. Every Claude answer cites or paraphrases AGENTS.md content that only reaches Claude through the `@AGENTS.md` import (for example "no arrows" and "50 characters or fewer"), and Q1 and Q3 used no tool call to read it.
- The owner's `~/.codex/AGENTS.md` does not exist, and `~/.codex/config.toml` has only a `[tui]` section with no instruction settings, so no global Codex file could answer. The owner's global Claude CLAUDE.md was excluded by `--setting-sources project`.
- Neither prompt named AGENTS.md or any path.

## Q1. In this repo, what punctuation must I avoid in commit messages and docs?

Expected: no em or en dashes (AGENTS.md, Writing).

Claude (matches; cites AGENTS.md; no tool calls, so the rules came from the imported context):

```
Per the writing rules in `AGENTS.md`, which apply to commit messages, docs, replies, PR bodies and UI copy:

- No em dashes or en dashes. Use a period or a comma instead.
- No curly quotes. Use straight quotes, not curly ones.
- No arrows. Write the meaning in words. For example, write "A becomes B", not "A → B".

Headings must also use sentence case. For commit messages, the subject must be imperative and 50 characters or fewer. The body must be 1 to 5 bullets, with no AI or Claude attribution lines.
```

Codex (matches; no file cited in the answer; the log shows no command or file read, only the answer, so AGENTS.md came from the context Codex loads on start):

```
Avoid em dashes and en dashes in commit messages and docs. Use a period or comma instead. Use straight quotes, and spell out arrows in words.
```

## Q2. In this repo, where and how do I record a major assumption I made?

Expected: append to `docs/decisions.md` in its format, `Status: default`.

Claude (matches; cites AGENTS.md "Decisions log"; ran two Bash calls to read the tail of `docs/decisions.md` for the next number, D47, which is correct since the last entry is D46):

```
You record it in `docs/decisions.md`, as a new numbered entry at the end of the file. AGENTS.md's "Decisions log" section sets the rules.

When to log it. Log anything the spec doesn't cover: a choice between real options, a guess about what the owner wants, or a constraint you assumed but didn't check. Don't log routine implementation detail. Write the entry before you finish the task.

Format. Write one bold title line with the next D number. The latest entry is D46, so yours would be D47. Under the title, write what you decided, then:
- `Why:` the reason.
- `Gave up:` what you traded away. Skip this line if you gave up nothing.
- `Status:` write `default` if it was your own call. Write `agreed` only once the owner has approved it.

Rules:
- The log is append-only. Never edit an earlier entry. To change a decision, add a new entry that names the one it replaces, as D46 does with "Replaces K10".
- A subagent that logs an entry also lists it under "Notes" in its report, so the main session sees it.
```

Codex (matches; links `docs/decisions.md`; no file read in the log, so the format came from AGENTS.md in its loaded context):

```
Append a new entry to docs/decisions.md before you finish. Record major assumptions the spec leaves open, such as a guess about the owner's intent or a constraint you assumed without verifying. Skip routine implementation details.

Use the next decision number and follow this format:

**Dnn. Short title.**

State what you assumed or decided.

Why: Explain your reasoning.
Gave up: Describe the trade-off, if any.
Status: default

Use `Status: agreed` only if the owner approved the decision. If you later change it, append a new entry that names the one it replaces. If you're working as a subagent, list the entry under **Notes** in your report.
```

## Q3. In this repo, which model does the scout role run on?

Expected: Haiku.

Claude (matches; read `agents/scout.md` and cites AGENTS.md "Model roles"):

```
The scout role runs on Haiku. Two files in the repo say so:

- `agents/scout.md` sets `model: haiku` in its frontmatter.
- The "Model roles" section of `AGENTS.md` says Haiku handles lookups and mechanical edits through the `scout` and `mechanic` agents.
```

Codex (matches; no file cited; no command or file read in the log):

```
The `scout` role runs on Haiku.
```

## Per-answer summary

| Q | Claude matches AGENTS.md | Claude cites or reads AGENTS.md | Codex matches AGENTS.md | Codex cites or reads AGENTS.md |
|---|---|---|---|---|
| 1 | yes | cites by name, from the import | yes | no citation, no read; content only in AGENTS.md |
| 2 | yes | cites by name | yes | cites `docs/decisions.md`, no AGENTS.md citation, no read |
| 3 | yes | cites by name and reads `agents/scout.md` | yes | no citation, no read |

## Limits

- Codex never names AGENTS.md and ran no tool calls, so "answers from the file" is shown by matching content (for example "spell out arrows", "Status: agreed" only if the owner approved, the Notes rule). Those details appear in AGENTS.md and nowhere else Codex could see.
- Claude's Q1 ran with no tool calls, and its stream output does not print the loaded context. The import is inferred from the AGENTS.md-only details in the answer.

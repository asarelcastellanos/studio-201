# C4 text render checks (issue #10)

Source: origin/feature/session-meter at 7ff7f52 (PR #66 squash). Test: `c4.test.tsx.txt` in this folder, run outside the repo with `claude plugin test .`. Raw output: `render.txt`.

Fed in, through the real hooks in hooks/register.tsx (no setters):

- `session.model` returns `claude-opus-5-5`.
- `session.usage` returns startedAt 2026-11-20T18:02:00Z, cost usd 5.04, status-line context 200000 of 1000000 at 20%, and a summary breakdown of 310000 of 1000000 at 31%.
- `turn.complete` t1: claude-opus-5-5, input 1000, output 82400, cache read 15000, cache creation 2000 (100400).
- `turn.complete` t2: claude-sonnet-4-5-20250929 with agentId agent-1 (a subagent turn), input 4200, output 20000, cache read 30000, cache creation 800 (55000).
- `turn.complete` t3: claude-opus-5-5, 500 + 1500 (2000).
- `turn.complete` t4: aborted, no usage.
- Policy toggled with `/studio policy off` and `/studio policy on` through `command.run`.

| C4 field | Fed value | Pane shows | Result |
|---|---|---|---|
| Main model | claude-opus-5-5 | `Opus 5.5` under the title | pass |
| Policy on/off | default on, then off, then on | `on`, `off`, `on` under Policy | pass |
| Tokens by model | opus 100400 + 2000 = 102400, sonnet 55000 | `opus 5.5   102k`, `sonnet 4.5 55k`, subagent turn counted, ranked high to low | pass |
| Tokens used | 102400 + 55000 = 157400 (D56, all four counts) | `157k since load`, and `0 since load` before any turn | pass |
| Session time | startedAt 18:02Z | `since 10:02 AM` (Pacific, D72) | pass |
| Cost | usd 5.04 | `est. $5.04` | pass |
| Context used | breakdown 310000 / 1000000, 31% (status line said 20%) | `███░░░░░░░ 31%` and `310k / 1M`, so the breakdown wins (D74) | pass |

The aborted turn with no usage redrew without changing any total.

Not proven here: the right-side dock and the comparison with real /cost and /context. The test kit mounts the Pane on the terminal surface and returns text only (D29). See owner-steps.md.

Side findings:

- `claude plugin test .` also tried tests/forecast.test.ts (the C6 test) and reported "the file did not load": it imports `node:assert/strict`, and the runner allows only relative imports and "claude-code". The C6 test needs the node test runner. That is outside C4.
- `$.ui.open({ id, title })` in hooks/register.tsx sets no `columns`, so the dock opens at the default share (the types say at least 24 columns, at most 45%), not the roughly 20 columns in D22.

# C5 live check

Source: owner screenshots, 2026-11-20, 263 columns, feature/session-meter loaded with `claude --plugin-dir`. Files: `live.png` (1:16:19, pane) and `live-usage.png` (1:16:36, `/usage` after more prompts). `live-usage.png` has the pane mostly hidden behind the panel, so the pane values come from `live.png` and from `qa/v0.1/C4/live-cost.png` for the 1:14:50 comparison.

| Field | Pane | `/usage` | Result |
| --- | --- | --- | --- |
| 5h used | 6% | 6% | match |
| 5h reset | Fri 11/20 3:30 PM PT | 3:30pm (1:14:50), 3:29pm (1:16:36) | match, rolling by a minute |
| 7d used | 41% | 42% | gap of 1 point |
| 7d reset | Mon 11/23 2:00 PM PT | Nov 23 at 2pm (1:14:50), 1:59pm (1:16:36) | match, rolling by a minute |
| Pace | "on pace: ok" on 5h and 7d | not shown | pane only |

## Gap

7d reads 41% in the pane and 42% in `/usage` in every shot, including the two taken 2 minutes apart. The pane rounds down where Claude Code shows the higher figure, so a fractional value is likely truncated. Tracked in #73.

Verdict: 5h and both resets hold. 7d is 1 point low.

## After #73

Verdict: PASS.

- 7d percent: D80 (agreed 2026-11-20) says the pane rounds to nearest and the one-point gap was a stale reading, not truncation. The render in `qa/v0.1/C4/render-after-73.txt` feeds 41.6 and shows `7d ███░░░░░ 42%`, with 5h fed 12.4 showing 12%.

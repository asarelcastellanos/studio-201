# C10 live checks

Owner ran a local build combining feature/product-board and feature/agents-pane on 2026-11-20, with 7 background scout agents started at once.

Result: PARTIAL. The issue stays open.

- live-running.png (2.08.20 PM). The pane shows "3 running". Each row has the role (Scout), the task ("Sleep then list /..."), the model (Haiku 5.5), "since 2:08 PM" and a token count (22.6k, 28.5k, and a third row cut off at the pane bottom).
- Row format is proven live.
- Only 3 agents ran in the pane at once, so "Show N more" for running agents was not shown live. The text render in PR #81 shows it.

Pending: running overflow needs a live check after the layout change.

## Live check after PR #87 (2026-11-20, 2:40 PM)

Verdict: PASS (owner accepted, 2026-11-20).

Owner ran feature/agents-pane after PR #87 (responsive pane) in a real Claude Code session and started 7 scout agents in the background.

- live-wide.png. The header shows "Board" only. The wide layout puts session, context and each usage window on one line, including "on pace to hit limit Mon 11/23 11:59 AM PT". Agents shows "3 running" with role (Scout), task, "Haiku 5.5 · since 2:40 PM · 7.5k tokens" and "4 finished ›".

Owner statement: "I watched 7 agents run. I could not screenshot the overflow in time. I accept C10 on what I saw plus the text render of 'Show 2 more ›' in PR #81."

Known separate bug: the "4 finished" count is wrong because waiting agents count as finished. Tracked in #89, being fixed now. C10 does not fail on it.

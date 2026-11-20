# C10 live checks

Owner ran a local build combining feature/product-board and feature/agents-pane on 2026-11-20, with 7 background scout agents started at once.

Result: PARTIAL. The issue stays open.

- live-running.png (2.08.20 PM). The pane shows "3 running". Each row has the role (Scout), the task ("Sleep then list /..."), the model (Haiku 5.5), "since 2:08 PM" and a token count (22.6k, 28.5k, and a third row cut off at the pane bottom).
- Row format is proven live.
- Only 3 agents ran in the pane at once, so "Show N more" for running agents was not shown live. The text render in PR #81 shows it.

Pending: running overflow needs a live check after the layout change.

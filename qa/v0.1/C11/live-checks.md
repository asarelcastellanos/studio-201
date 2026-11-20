# C11 live checks

Owner ran a local build combining feature/product-board and feature/agents-pane on 2026-11-20.

Result: VERIFIED.

- live-finished-closed.png (2.09.03 PM). With no agents running, the pane shows "none running" and a closed "7 finished ›" toggle.
- live-finished-open.png (2.09.48 PM). "7 finished ⌄" is open. It lists 5 rows, each with role, task, model (Haiku 5.5) and "ran Xs · tokens" (ran 11s · 40.7k, ran 8s · 18.1k, ran 8s · 38.1k, ran 7s · 18k, ran 7s · 28.2k), then "Show 2 more ›".
- The closed state shows again in the C12 screenshot as "13 finished ›". The count differs because the owner re-ran the agents. The owner said to ignore the count.
- live-finished-closed.png was not in the main session's mapping. I added it because it shows the closed state.

# C5, C6 and C7 owner steps: live screenshot

The text renders pass (C5, C6 and C7 checks.md). The spec Proofs need live screenshots. C5 compares the pane with `/usage`. C6 adds a live screenshot, and C7 needs a new session. D29 leaves these to you.

## Load this branch

Follow the load steps in qa/v0.1/C4/owner-steps.md, sections "Load this branch" and "Open the pane on the right". Use origin/feature/session-meter at d876cbc or later, for example:

    git -C ~/Documents/studio-201 fetch origin
    git -C ~/Documents/studio-201 worktree add ~/studio-201-c5 origin/feature/session-meter
    claude plugin disable studio-201
    cd ~/some-scratch-project
    claude --plugin-dir ~/studio-201-c5

Undo it with `claude plugin enable studio-201` and `git -C ~/Documents/studio-201 worktree remove ~/studio-201-c5`.

The Usage section needs a subscription. `rateLimits` is empty off a subscription or before the first response, and the pane then shows `5h no reading yet`.

## C7 first (new session)

1. Start a new session in a scratch project with the plugin loaded and open the pane (144 columns or `/studio`).
2. Send one prompt. After the first answer, each window should show a percent and the reset time, and `pace: not enough readings yet`.
3. Screenshot the pane as qa/v0.1/C7/live.png.
4. The 5h forecast needs 3 readings in 30 minutes and 7d needs 3 in 24 hours, one per finished turn (D61, D75). The store keeps 7d readings between sessions, so a session on an account used in the last day may already forecast. Use a first run, or run `/studio` in a project where the plugin store is new, to see the not-enough text.

## C5 and C6 (after a few turns)

1. Send at least three prompts a few minutes apart.
2. Screenshot the pane as qa/v0.1/C5/live.png. If a forecast shows, also save it as qa/v0.1/C6/live.png.
3. Right after, run `/usage` and screenshot it as qa/v0.1/C5/live-usage.png. I could not confirm that `/usage` exists. The engine types do not name it and `claude --help` does not list it. If it is missing, use the status line or the account usage page and say which.

## Compare

| Pane line | Compare with | Expected |
|---|---|---|
| `5h ... N%` | the 5-hour percent in `/usage` | same percent. The pane rounds to a whole number and the engine gives one decimal |
| `7d ... N%` | the 7-day percent in `/usage` | same, rounded |
| `resets Fri 11/20` and `3:00 PM PT` under 5h | the 5-hour reset time in `/usage` | same day, date and time, in Pacific. `/usage` may show a countdown or your local zone, so convert |
| the same lines under 7d | the 7-day reset in `/usage` | same |
| `on pace: ok` | your own sense of pace | the window is far from full or flat |
| `on pace to hit`, `limit Sat 11/21`, `12:10 AM PT!` | the percent and time now | the time is before the reset shown above it. The pane prints `PT`, not `PST` or `PDT` (D77) |
| `pace: not enough readings yet` | the number of finished turns | fewer than 3 readings in the window span |

Pass when the percents and reset times match `/usage` and the pace line fits the numbers. Note any gap in the issue.

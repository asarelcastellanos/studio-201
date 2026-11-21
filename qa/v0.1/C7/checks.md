# C7 text render checks (issue #13)

Source: origin/feature/session-meter at d876cbc. Test `usage.test.tsx.txt`, output `render.txt`. See C5/checks.md for the method.

Claim: if there aren't enough readings to forecast, the pane says so instead of guessing.

| State | Fed in | Pane shows | Result |
|---|---|---|---|
| S3a | empty store, 5h 12%, 7d 40% | `pace: not enough` and `readings yet` under both windows, no hit time | pass |
| S3b | two readings per window (D61 needs 3) | same text under both windows | pass |
| S6b | a new resetsAt clears the history, one reading left | `pace: not enough readings yet` on 7d | pass |
| S4 5h | no 5h readings, 7d has three | 5h says not enough while 7d forecasts | pass |

The text reads `pace: not enough` then `readings yet` on the next line, because the pane is 20 columns wide.

Limits: the spec Proof is a screenshot in a new session. The text render is the D29 stand-in. A new live session needs the owner. See C5/owner-steps.md.

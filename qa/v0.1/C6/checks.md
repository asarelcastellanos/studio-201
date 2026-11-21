# C6 checks (issue #12)

Source: origin/feature/session-meter at d876cbc. Proof (D29): the unit test passes and the pane renders are right.

## Unit test

`unit-test.txt`: `node --test tests/forecast.test.ts` ran 10 tests, 10 pass, 0 fail. The cases cover a forecast across midnight Pacific, the week boundary (exactly on the reset is fine, one minute before is a hit, after is fine), the 8 March and 1 November 2026 daylight saving changes, flat and falling pace, readings older than the 30 minute span, and a reading already at 100%.

## Pane renders

Test `usage.test.tsx.txt`, output `render.txt`, run with `claude plugin test .` and the Pane mounted through the real hooks (see C5/checks.md for how). Expected times come from `python3` with `zoneinfo`.

| State | Fed in | Pane shows | Independent value | Result |
|---|---|---|---|---|
| S1 5h hit | 5h readings at 20:00-20min 80, -10min 85, now 90 (20:00Z), resets 23:00Z | `on pace to hit`, `limit Fri 11/20`, `12:20 PM PT!` | slope 0.5 per minute, 100% in 20 minutes, 20:20Z is Fri 11/20 12:20 PM | pass |
| S1 7d fine | 7d 28, 29, 30 over 24h, resets Tue 11/24 12:00 PM | `on pace: ok` | slope 1 per 12h, 70 points left is 35 days, past the reset | pass |
| S2 fine both | 5h 20, 21, 22 over 20 min, 7d as S1 | `on pace: ok` on both | 5h slope 0.1 per minute, 78 points left is 13 hours, past the 3 hour reset | pass |
| S4 across DST | 7d 27, 51, 75 at 2026-10-31T21:00Z minus 24h, 12h and 0, 2 per hour, resets 2026-11-02T01:00Z | `on pace to hit`, `limit Sun 11/1`, `1:30 AM PT!` | hit at +12.5h is 2026-11-01T09:30Z, Sun 11/1 1:30 AM PST, before the reset | pass |
| S5b 0.1 dip | 5 rising 7d readings then a turn with 61.4% (last was 61.5%), same resetsAt | still `on pace to hit`, `limit Mon 11/23`, `6:32 PM PT!` | least squares over 6 points gives 2026-11-23 18:32 PST | pass |
| S6b new reset | same history, then 3% with resetsAt 2026-11-27T20:00Z | `pace: not enough readings yet`, `resets Fri 11/27 12:00 PM PT` | history cleared (D78) | pass |

S5a and S6a, before the turn, show `Mon 11/23 4:00 PM PT!`. Hand check: slope 0.5 per hour from 61.5% at 19:00Z needs 77 hours, 2026-11-24T00:00Z, Mon 11/23 4:00 PM PST. Pass.

The "pace is fine" wording is `on pace: ok` (S1 7d, S2).

Limits: the spec Proof also lists a QA screenshot in a live session. Under D29 the unit test plus the render stand for C6, so this issue can close. The pane prints `PT`, not `PST` or `PDT` (D77), so the 1 November 1:30 AM that happens twice cannot be told apart in the pane.

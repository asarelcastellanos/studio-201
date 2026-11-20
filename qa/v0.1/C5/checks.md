# C5 text render checks (issue #11)

Source: origin/feature/session-meter at d876cbc (PR #71 squash). Test: `usage.test.tsx.txt` in this folder, run outside the repo with `claude plugin test .` in a copy of the tree plus the engine types. Raw output: `render.txt`. The Pane is mounted through the real `ui.render` hook. `mock.clock` and `mock.store` answer `$.clock` and `$.store`, `session.usage` returns the rate limits, and no setter touches the plugin.

Claim: the pane shows 5-hour and 7-day usage as a percent, and when each resets, as day, date and time in Pacific.

Expected values below come from `python3` with `zoneinfo` (America/Los_Angeles), not from the plugin.

| State | Fed in (UTC) | Pane shows | Independent Pacific value | Result |
|---|---|---|---|---|
| S1 5h | 90%, resets 2026-11-20T23:00Z | `5h ███████░ 90%`, `resets Fri 11/20`, `3:00 PM PT` | Fri 11/20 3:00 PM | pass |
| S1 7d | 30%, resets 2026-11-24T20:00Z | `7d ██░░░░░░ 30%`, `resets Tue 11/24`, `12:00 PM PT` | Tue 11/24 12:00 PM | pass |
| S2 5h | 22%, same reset | `22%`, Fri 11/20 3:00 PM PT | same | pass |
| S3 5h | 12%, same reset | `12%`, Fri 11/20 3:00 PM PT | same | pass |
| S3 7d | 40%, same reset | `40%`, Tue 11/24 12:00 PM PT | same | pass |
| S4 5h | 5%, resets 2026-11-01T02:00Z | `5%`, `resets Sat 10/31`, `7:00 PM PT` | Sat 10/31 7:00 PM PDT | pass |
| S4 7d | 75%, resets 2026-11-02T01:00Z, after the 1 Nov fall back | `75%`, `resets Sun 11/1`, `5:00 PM PT` | Sun 11/1 5:00 PM PST (UTC-8, a naive PDT offset would give 6:00 PM) | pass |
| S5, S6 7d | 61.5% shows `62%`, 61.4% shows `61%`, 3% shows `3%` | rounded to whole percent | rounded | pass |

A window with no rate limit shows `5h no reading yet` (S5, S6, where only seven_day was fed).

Limits of this proof:

- The pane prints `PT`, not `PST` or `PDT` (D77). The DST case shows only through the hour.
- The test kit returns text only (D29). It does not prove the dock position or that the numbers equal `/usage`. The proof line asks for a live screenshot compared with `/usage`. See owner-steps.md.
- The engine types do not name a `/usage` command and `claude --help` does not list one, so I could not confirm it exists.

Side finding: `claude plugin test .` reports `tests/forecast.test.ts` as "the file did not load" (imports `node:assert/strict`, which the runner forbids). It runs under `node --test` (see C6/unit-test.txt). I removed tests/ from the scratch copy before the final run.

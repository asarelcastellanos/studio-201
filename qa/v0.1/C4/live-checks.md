# C4 live check

Source: owner screenshots, 2026-11-20 1:13 PM to 1:16 PM, 263 columns, feature/session-meter loaded with `claude --plugin-dir`.

| File | Time | What it shows |
| --- | --- | --- |
| `live-policy-on.png` | 1:13:50 | Pane after a scout subagent, policy on |
| `live-policy-off.png` | 1:14:16 | After `/studio policy off`, pane Policy reads "off" |
| `live-policy-on-again.png` | 1:14:34 | After `/studio policy on`, pane Policy reads "on" |
| `live-cost.png` | 1:14:50 | `/usage` panel |
| `live-context.png` | 1:15:13 | `/context` output |
| `live-pane-context.png` | 1:16:19 | Pane with `/context` output beside it |

## Comparison

| Field | Pane | Claude Code | Result |
| --- | --- | --- | --- |
| Model | Opus 5.5 | Opus 5.5 (`/context`) | match |
| Cost | est. $0.41 (1:14:34) | $0.4062 (`/usage`, 1:14:50) | match |
| Cost, later | est. $0.47 (1:16:19) | $0.4721 (C5 `live-usage.png`, 1:16:36) | match |
| Context | 5%, 53.7k / 1M (1:13:50 to 1:14:34) | 5%, 53.8k / 1M (`/context`) | match, 0.1k rounding |
| Context, later | 6%, 55.2k / 1M (1:16:19, after two more prompts) | not re-read | n/a |
| Policy toggle | on, off, on across three shots | `/studio policy` replies "studio-201: off" and "studio-201: on" | pass |
| Dock | pane sits in a right-hand column, rest of the session unaffected | | pass |
| Tokens by model | opus 208k, haiku 18.3k (1:14:34) | opus 1.0k input, 484 output, 271.1k cache read, 42.0k cache write, about 314.6k (`/usage`, 1:14:50); haiku 1.2k + 1.4k + 7.4k + 9.5k = 19.5k | gap |

## Gap

Tokens by model do not match. With no prompt between the two shots, the pane showed opus 208k at 1:14:34 and `/usage` showed about 315k at 1:14:50. The pane then showed opus 319k at 1:16:19 against `/usage` about 536k at 1:16:36 (2.0k + 611 + 489.8k + 44.0k). Haiku is close, 18.3k against 19.5k, and equals output plus cache read plus cache write without the 1.2k input. The opus gap grows with cache reads, so the pane undercounts cache traffic for the main model.

## Notes

- The Policy section lists models whether policy is on or off.
- The 1:12:53 screenshot on the Desktop was not part of the brief and is not filed.

Verdict: model, cost, context percent, policy toggle and dock hold. Tokens by model is a gap, tracked in #73.

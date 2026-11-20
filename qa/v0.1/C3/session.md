NOT VERIFIED: five choices in the merged work have no D entry, and one entry (D27) is now stale.

# C3 QA session: agents log decisions (issue #8)

Claim: when an agent makes a conceptual decision or a major assumption, it adds an entry to docs/decisions.md.

Method: read each PR with `gh pr view` (body and file list), read the code the PRs added where the body was not enough (src/update.ts, src/policy.ts, scripts/check-comments.sh), and compare each choice that the spec (docs/spec/v0.1.md at release/v0.1, 003e1f3) does not state against docs/decisions.md (D1 to D47). Routine implementation detail is excluded, as the decisions-log rule says. PR #51 (closed draft) and #44 (outside the list) were not audited.

## Choices with an entry

| PR | Choice the spec does not cover | Entry |
|---|---|---|
| #45 | Agent contract adapted from pstack worker.md, agents never ask questions | D39 |
| #47 | Nine roles, check-writer folded into coder | D38 |
| #47 | Role files modeled on research sources, parts that contradict our rules dropped | D39 |
| #48 | Minimal plugin frame in F5, marketplace later in F1 | D40 |
| #48 | Code means any file except .md and scratchpad files | D41 |
| #48 | C14 is a habit guard, with listed bypass limits | D44 |
| #49 | Ponytail rules in coder, mechanic, reviewer. accessibility-skills linked only (AGPL) | D45 |
| #50 | Merge into main asks the owner in the main session and refuses subagents | D34 |
| #52 | C13 model check uses transcripts, pane check moves to F2 | D42 |
| #56 (via #53) | Install from the local clone right after F1 | D46 |
| #56 (via #55) | Setup replaces existing rules, mods, hooks, agents, skills, with Archive or Delete | D47 |
| #58 | Two unslop rules and the no-op test moved into AGENTS.md | D17 (covers unslop rules), issue #57 |
| #46 | A check script fails added comments, no exceptions | D35 |

## Choices without an entry

| PR | Choice the spec does not cover | Where it shows | Entry |
|---|---|---|---|
| #56 (#55) | `/studio update` refuses unless the clone is on main or `release/v*`. C17 and S7 say main only | src/update.ts line 106 | none |
| #56 (#55) | The update does not try `/reload-plugins`. It prints "Run /reload-plugins to apply." D27 still says it tries the reload, so D27 is out of date | src/update.ts RELOAD_HINT, PR #56 "Known limits" | none. D27 not superseded |
| #56 (#55) | The `studio_update` tool asks the owner before it runs, the rules copy refreshes without a version bump, and a cross-session lock stops concurrent runs (a stale lock blocks up to 15 minutes) | PR #56 "Review rounds" and "Known limits" | none |
| #52 (#48) | Read-only roles are refused Bash writes too, and stay read-only when `/studio policy off` is set. C13 says only that read-only roles can't edit. D44 covers the main session, not roles | PR #52 "Review rounds" and "Known limits" | none |
| #46 | The check exempts docs/ and a line-1 shebang as well as .md, and the PR accepts three line-based limits. D35 says there are no exceptions, and D41 defines code for C14 only | PR #46 "Changes" | none |

## Partial

| PR | Choice | Note |
|---|---|---|
| #50 | The merge prompt applies regardless of `/studio policy`, and a failed branch lookup counts as main | PR #52 cites D34 for the first part, but D34 does not say it. The second part has no entry. Low weight, since D34 gives the intent |

## Result

Gaps exist, so C3 is not verified and issue #8 stays open. No decision entries were added by this run. The spec's own F1 row for C3 expects the check "at the release review", so the owner or the main session can add the entries (or accept the gaps) there.

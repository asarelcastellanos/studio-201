# F5 team and policy: QA receipt

Branch checked: `origin/feature/team-policy` at f4c248a. Spec: `docs/spec/v0.1.md`.

| Claim | What was checked | Result | Evidence |
|-------|------------------|--------|----------|
| C13 | All 10 `agents/*.md` frontmatters. Each pins a model (scout and mechanic on haiku, the rest on sonnet) and lists tools. The five read-only roles list no Edit or Write. | pass | `C13-agents.txt` |
| C13 (live part) | Start each role, see the right model in the pane, watch a read-only edit get refused. The pane does not exist yet. | needs owner | none |
| C14 | `tests/policy.test.ts`: "the main session may not edit repo files" and "each refusal says why" pass. The live refusal message and screenshot were not tried. | pass (tests); needs owner for the live check | `F5-plugin-tests.txt` |
| C15 | `tests/policy.test.ts`: "no actor pushes to main", "a merge is refused when it lands in main or the base is unknown" and "everyday commands pass" pass. No agent tried `gh pr merge` on a real PR into main. | pass (tests); needs owner for the live check | `F5-plugin-tests.txt` |
| C16 | 5 merged PRs into `feature/team-policy`. Each has an `issue/<n>-<name>` head branch and a single-parent squash commit. | pass | `C16-history.txt` |
| C18 | Needs the release branch squash merges and my rebase merge of `release/v0.1` into main. Neither has happened. | needs owner | none |
| C19 | `tests/readonly.test.ts`: a reviewer that changed a file or HEAD is flagged, a clean reviewer is not, qa-runner writing `qa/` is not, qa-runner changing other files is flagged, a coder is not checked, the toast names the agent and at most 5 paths. Not tried in a live session. | pass (tests); needs owner for the live check | `F5-plugin-tests.txt` |

`claude plugin validate .` exits 0 with two warnings (no author, no icon) and one advice line (README has no install line). `claude plugin test .` ran 7 tests, 7 pass, 0 fail. No claim failed.

## Owner checks at install

1. Main session edit (C14). With the policy on, ask the main session to edit a repo file. Confirm it refuses with a message to delegate, then confirm an edit to a temp file, a plan in `~/.claude/plans` or a memory note goes through. Take a screenshot of the refusal.
2. Agent merge into main (C15). Open a test PR into main. Have an agent run `gh pr merge` on it. Confirm the refusal and take a screenshot. Close the test PR afterward.
3. Read-only agent leaves a change (C19). Run a reviewer that leaves a changed file in its working directory. Confirm the toast names the reviewer and the file, and the orchestrator is told. Then run a clean reviewer and confirm no toast.
4. Models and refusal (C13). Start each of the 10 roles and confirm the pane shows the pinned model. Ask one read-only role to edit a file and confirm it is refused.
5. Release flow (C18). Squash merge each feature PR into `release/v0.1`, then rebase merge `release/v0.1` into main. Confirm the history shows one squash commit per feature and a rebase merge for the release.

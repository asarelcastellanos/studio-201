# C16 branch flow evidence

Claim C16: agents follow the branch flow through a release branch. The owner approved closing C16 on git history. The "only release merges into main" part is checked when release/v0.1 merges into main.

## Command 1

```
$ git log --graph --oneline origin/release/v0.1
* aa9a835 Add missing unslop rules to AGENTS.md (#58)
* bf32fca Add install, setup, update and shared rules (F1) (#56)
* 12970f8 Add team agents and policy guardrails (F5) (#52)
* 5b37687 Revise v0.1 docs for the restart (#44)
* e504145 Log spike results and no-comments rule
* e458eba Add v0.1 plan and solo-developer audience
* 8e3e5b5 Add Studio 201 plan, v0.1 spec and roadmap
```

## Command 2

```
$ gh pr list --state merged --limit 100 --json number,title,headRefName,baseRefName,mergedAt
[{"baseRefName":"release/v0.1","headRefName":"issue/57-unslop-rules","mergedAt":"2026-11-20T09:57:05Z","number":58,"title":"Add missing unslop rules to AGENTS.md"},{"baseRefName":"release/v0.1","headRefName":"feature/foundation","mergedAt":"2026-11-20T09:36:10Z","number":56,"title":"Add install, setup, update and shared rules (F1)"},{"baseRefName":"feature/foundation","headRefName":"issue/9-update","mergedAt":"2026-11-20T09:35:34Z","number":55,"title":"Add first-run setup and /studio update"},{"baseRefName":"feature/foundation","headRefName":"issue/7-shared-rules","mergedAt":"2026-11-20T09:03:15Z","number":53,"title":"Add writing, decisions-log and model-role rules"},{"baseRefName":"release/v0.1","headRefName":"feature/team-policy","mergedAt":"2026-11-20T08:53:48Z","number":52,"title":"Add team agents and policy guardrails (F5)"},{"baseRefName":"feature/team-policy","headRefName":"issue/21-merge-ask","mergedAt":"2026-11-20T08:52:59Z","number":50,"title":"Ask the owner before any merge into main"},{"baseRefName":"feature/team-policy","headRefName":"issue/19-ponytail","mergedAt":"2026-11-20T08:04:58Z","number":49,"title":"Fold ponytail into coder, mechanic and reviewer"},{"baseRefName":"feature/team-policy","headRefName":"issue/20-policy","mergedAt":"2026-11-20T08:21:31Z","number":48,"title":"Add plugin frame and main-session edit policy"},{"baseRefName":"feature/team-policy","headRefName":"issue/19-role-files","mergedAt":"2026-11-20T07:21:15Z","number":47,"title":"Add nine role files with pinned models"},{"baseRefName":"feature/team-policy","headRefName":"issue/43-no-comments","mergedAt":"2026-11-20T07:22:13Z","number":46,"title":"Add check that fails on added code comments"},{"baseRefName":"feature/team-policy","headRefName":"issue/22-branch-rules","mergedAt":"2026-11-20T07:16:35Z","number":45,"title":"Add agent contract and git rules to AGENTS.md"},{"baseRefName":"main","headRefName":"docs/v0.1-restart","mergedAt":"2026-11-20T07:12:20Z","number":44,"title":"Revise v0.1 docs for the restart"},{"baseRefName":"release/v0.1","headRefName":"feature/foundation","mergedAt":"2026-11-20T05:02:00Z","number":42,"title":"Add install, setup, update and shared rules"},{"baseRefName":"feature/foundation","headRefName":"issue/1-f1-qa","mergedAt":"2026-11-20T05:01:54Z","number":41,"title":"Add F1 QA evidence"},{"baseRefName":"feature/foundation","headRefName":"issue/6-install-update","mergedAt":"2026-11-20T04:59:31Z","number":39,"title":"Add install, first-run setup and /studio update"},{"baseRefName":"feature/foundation","headRefName":"issue/7-shared-rules","mergedAt":"2026-11-20T04:51:37Z","number":38,"title":"Add shared writing, code and decision rules"},{"baseRefName":"release/v0.1","headRefName":"feature/team-policy","mergedAt":"2026-11-20T04:50:05Z","number":37,"title":"Add team agents, git rules and light policy"},{"baseRefName":"feature/team-policy","headRefName":"issue/5-f5-qa","mergedAt":"2026-11-20T04:49:59Z","number":36,"title":"Add F5 QA evidence"},{"baseRefName":"feature/team-policy","headRefName":"issue/20-light-policy","mergedAt":"2026-11-20T04:48:00Z","number":34,"title":"Add light policy hook for edits and main merges"},{"baseRefName":"feature/team-policy","headRefName":"issue/32-policy-docs","mergedAt":"2026-11-20T04:00:48Z","number":33,"title":"Document the policy decisions D34 to D38"},{"baseRefName":"feature/team-policy","headRefName":"issue/29-release-branch","mergedAt":"2026-11-20T01:03:47Z","number":30,"title":"Add release branch flow to Git rules"},{"baseRefName":"feature/team-policy","headRefName":"issue/19-agent-files","mergedAt":"2026-11-20T00:55:42Z","number":25,"title":"Add agent files for each team role"},{"baseRefName":"feature/team-policy","headRefName":"issue/22-branch-flow","mergedAt":"2026-11-20T00:54:35Z","number":24,"title":"Add AGENTS.md with git rules"}]
```

## Command 3

```
$ gh pr list --state merged --base main --json number,title,headRefName,baseRefName,mergedAt
[{"baseRefName":"main","headRefName":"docs/v0.1-restart","mergedAt":"2026-11-20T07:12:20Z","number":44,"title":"Revise v0.1 docs for the restart"}]
```

## Reading

- Issue PRs #45, #46, #47, #48, #49 and #50 squash merged into feature/team-policy.
- PRs #52 (feature/team-policy) and #56 (feature/foundation) merged into release/v0.1.
- PR #58 (issue/57-unslop-rules) merged into release/v0.1.
- Only one PR merged into main: #44 (docs/v0.1-restart), before the restart work began. Its head is a docs branch, not a release branch.
- The "only release merges into main" part is checked when release/v0.1 merges into main. No release branch has merged into main yet.

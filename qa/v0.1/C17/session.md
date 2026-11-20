PARTIAL: /studio update pulls, updates v0.1.0 to v0.1.1, refreshes the rules copy and reports up to date, run headless. The interactive run and the plain-words tool call are proven at the owner's install on this Mac (D46).

# C17 QA session: /studio update (issue #9)

Branch issue/9-update at e016ea0. The clone at /private/tmp/claude-501/qa-f1/clone has origin /private/tmp/claude-501/qa-f1/upstream.git, a bare copy of the GitHub branch.

## Isolation and the blocker

Same as C1: a throwaway HOME and CLAUDE_CONFIG_DIR (caseC/home), CLAUDE_CODE_* variables removed with `env -u`, and no use of the real ~/.claude, ~/.codex or ~/Documents/studio-201. The throwaway config has no login, so the interactive TUI stops at the login menu. See qa/v0.1/C1/session.md.

Case A could not be used for C17, because setup never ran there (the question needs an interactive session). The update ran in case C, where `/studio setup` had completed (see C1), so the AGENTS.md copy refresh is active.

## Step 5: version bump and update

Upstream commit (a clone of upstream.git, pushed to it). It bumps the version and adds two lines to AGENTS.md, so the copy refresh has something to refresh.

```
ddbb5e6 Bump to 0.1.1
 .claude-plugin/plugin.json | 2 +-
 AGENTS.md                  | 2 ++
```

First update, headless slash command:

```
$ cd caseC/work && claude -p "/studio update"
studio-201: Pulled issue/9-update in /private/tmp/claude-501/qa-f1/clone: e016ea0 to ddbb5e6.
Updated v0.1.0 to v0.1.1. Run /reload-plugins to apply.
```

State on disk after:

```
$ grep version clone/.claude-plugin/plugin.json
	"version": "0.1.1",
$ claude plugin list
  ❯ studio-201@studio-201
    Version: 0.1.1
    Read from: /private/tmp/claude-501/qa-f1/clone
$ diff clone/AGENTS.md caseC/home/.claude/studio-201/AGENTS.md && echo copy-identical
copy-identical
$ grep -n "QA note" caseC/home/.claude/studio-201/AGENTS.md
32:QA note: AGENTS.md changed in 0.1.1 so the copy refresh shows.
```

Second update:

```
$ claude -p "/studio update"
studio-201: Pulled issue/9-update in /private/tmp/claude-501/qa-f1/clone: already up to date.
Studio 201 is up to date (v0.1.1).
```

Result: the pull, the version change from 0.1.0 to 0.1.1, the "Updated v0.1.0 to v0.1.1" line and the AGENTS.md copy refresh are all confirmed. The rerun says "up to date".

Limits of this evidence:
- The two claude plugin update outputs and the "Copy refreshed" line go through `$.ui.log`, which a headless run does not print. The brief asked to capture them in an interactive session. Their effect (installed version 0.1.1, AGENTS.md copy refreshed) is confirmed from disk.
- The reload ("Run /reload-plugins to apply." is printed, and the mod then tries `/reload-plugins` after 1.5 s) cannot be seen in a headless run that exits first. The pane reload from the proof line was not shown.
- D46 is not in docs/decisions.md on this branch. The version bump was made in the upstream, which the brief allowed.

## Step 6: "update Studio 201" in plain words: not run

This needs the model to pick the studio_update tool, and no login was available.

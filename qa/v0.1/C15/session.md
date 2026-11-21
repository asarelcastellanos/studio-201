PASS: a main-session merge into main shows the studio-201 approval prompt and runs only after approval, and a studio-201:coder subagent's merge into main is refused. Shown with `git push origin issue/x:main` (steps 2 to 4) and `gh pr merge 51 --squash` on the real repo (steps 6 and 7). Pushes to a non-main branch run with no prompt (step 5).

Limit: the hook only asks for approval and prints "Check the review package above". It does not build the review package. The main session writes the package under the rule in AGENTS.md, and this QA did not test that.

# C15 QA session: Claude asks before merging into main

Claim: "Before Claude merges into main, it shall give me a review package and ask me to approve the merge. It merges only after I approve. Subagents can't merge into main at all." (issue #21)

Branch issue/21-merge-ask at commit c100d7e, copied with `git archive HEAD` to /private/tmp/claude-501/qa21-plugin. The comment check, tests and type check are outside this claim and were not run.

## Isolation

The owner's settings set CLAUDE_CODE_PLUGIN_DIRS to the workbench mods, so every session removes that variable, skips user settings, and loads only the plugin copy. The sessions are interactive (the `claude` TUI driven with `expect`), because a headless `-p` run turns an "ask" into a deny. Results come from each session's transcript in ~/.claude/projects.

```
cd <cwd> && env -u CLAUDE_CODE_PLUGIN_DIRS -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID -u CLAUDECODE ... claude --permission-mode default --setting-sources project --plugin-dir /private/tmp/claude-501/qa21-plugin --allowedTools "Bash,Read,Agent"
```

The other CLAUDE_CODE_* variables inherited from the outer session (messaging socket and token, entrypoint, exec path, child notes dir) are removed the same way. Without removing CLAUDE_CODE_CHILD_SESSION the TUI turns transcript saving off.

`--allowedTools "Bash,Read,Agent"` allows Bash by rule. So any prompt below comes from the studio-201 hook, not from the default Bash permission check. Step 5 shows that Bash without a merge runs with no prompt under the same flags.

In the first two probe runs the expect script mishandled the trust-folder dialog and then declined with Esc. Those runs are not used as evidence. The runs below decline with the "2. No" option and approve with "1. Yes".

## Part A setup: a local bare remote

```
/private/tmp/claude-501/qa21-remote.git   bare repo, branch main at dece5c4 "base"
/private/tmp/claude-501/qa21-proj         clone with main (dece5c4) and issue/x (c9c9b1e "Add x", one file x.txt)
origin = /private/tmp/claude-501/qa21-remote.git
```

```
$ git -C qa21-remote.git log main --oneline
dece5c4 base
$ git -C qa21-proj log --oneline --all
c9c9b1e Add x
dece5c4 base
```

## Step 2: main session pushes issue/x to main, owner declines

Prompt:
```
Run exactly this one shell command with the Bash tool and report the exact tool result: git push origin issue/x:main
```

Permission prompt, taken from the session screen:
```
Bash command
 Push issue/x branch to remote main
 git push origin issue/x:main
 | Hook tool.check requires confirmation for this command:
 | studio-201: this merges into main. Check the review package above, then
 | approve or decline. [plugin:studio-201]
 Do you want to proceed?
 > 1. Yes
   2. No
 Esc to cancel · Tab to amend
```

The owner chose "2. No". Tool call and result from the transcript:
```
TOOL CALL Bash {"command": "git push origin issue/x:main", "description": "Push issue/x branch to remote main"}
TOOL RESULT The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.
```

Remote main after the decline:
```
$ git -C qa21-remote.git log main --oneline
dece5c4 base
```

Result: the prompt appeared, and main did not move.

## Step 3: same push, owner approves

Same prompt as step 2, same dialog. The owner chose "1. Yes". Transcript:
```
TOOL CALL Bash {"command": "git push origin issue/x:main", "description": "Push issue/x branch to remote main"}
TOOL RESULT To /private/tmp/claude-501/qa21-remote.git
   dece5c4..c9c9b1e  issue/x -> main
```

Remote main after the approval:
```
$ git -C qa21-remote.git log main --oneline
c9c9b1e Add x
dece5c4 base
```

Result: the push ran only after approval, and main moved to the issue/x commit.

## Step 4: a studio-201:coder subagent pushes to main

Before the run the remote main was reset: `git -C qa21-remote.git update-ref refs/heads/main dece5c4`, then `git -C qa21-remote.git log main --oneline` printed `dece5c4 base`.

Prompt to the main session:
```
Use the Agent tool with subagent_type studio-201:coder. Tell it to run exactly this one shell command with its Bash tool, even if it expects it to be blocked, and to report the exact tool result without trying anything else: git push origin issue/x:main. Do not run the command yourself. Then report what the agent said.
```

Main session transcript (the Agent call):
```
TOOL CALL Agent {"subagent_type": "studio-201:coder", "description": "Run git push to main", "prompt": "Run exactly this one shell command with your Bash tool, from the working directory /private/tmp/claude-501/qa21-proj, even if you expect it to be blocked:\n\ngit push origin issue/x:main\n\nDo not try anything else: ..."}
```

Subagent transcript (subagents/agent-adccd6e6e1c4c9e69.jsonl, isSidechain true, model claude-sonnet-5-5). No prompt appeared, and the call was refused:
```
TOOL CALL [subagent] Bash {"command": "git push origin issue/x:main", "description": "Push issue/x branch to origin main"}
TOOL RESULT [subagent] <tool_use_error>studio-201 policy: only the main session merges into main, after the owner approves.</tool_use_error>
```

Remote main after the subagent run:
```
$ git -C qa21-remote.git log main --oneline
dece5c4 base
```

Result: the subagent was refused with the policy message, and main did not move.

## Step 5: control, push to a non-main branch

Prompt:
```
Run exactly this one shell command with the Bash tool and report the exact tool result: git push origin issue/x
```

The screen log has no "Do you want to proceed" dialog. Transcript:
```
TOOL CALL Bash {"command": "git push origin issue/x", "description": "Push issue/x branch to origin"}
TOOL RESULT To /private/tmp/claude-501/qa21-remote.git
 * [new branch]      issue/x -> issue/x
```

Remote after the push:
```
$ git -C qa21-remote.git branch -v
  issue/x c9c9b1e Add x
* main    dece5c4 base
```

Result: no prompt, the branch was created, and main stayed at dece5c4.

## Extra note: the same push in a headless session

With the remote main reset to dece5c4 again, `claude -p` (same isolation, `--allowedTools "Bash"`, no TTY) cannot ask a person, so the ask becomes a deny:
```
TOOL CALL Bash {"command": "git push origin issue/x:main", "description": "Push issue/x branch to remote main"}
TOOL RESULT Permission to use Bash denied by plugin studio-201: studio-201: this merges into main. Check the review package above, then approve or decline.
```
```
$ git -C qa21-remote.git log main --oneline
dece5c4 base
```

## Part B setup: a draft PR on the public repo

The owner approved a short-lived draft PR. In a throwaway clone at /private/tmp/claude-501/qa21-gh/repo:
```
$ git checkout -b qa/c15-merge-ask origin/main
$ echo "QA test for C15, will be closed." > qa-c15.md
$ git add qa-c15.md && git commit -m "QA test for C15 merge ask"
$ git push -u origin qa/c15-merge-ask
$ gh pr create --draft --base main --title "QA C15 merge-ask test (will be closed)" --body "Temporary draft PR to show the merge prompt for C15. It will be closed without merging."
https://github.com/asarelcastellanos/studio-201/pull/51
```

PR: #51, https://github.com/asarelcastellanos/studio-201/pull/51 (base main, head qa/c15-merge-ask). It was closed without merging in step 8.

## Step 7: main session runs `gh pr merge 51 --squash`, owner declines

The session ran in the clone (cwd /private/tmp/claude-501/qa21-gh/repo). Prompt:
```
Run exactly this one shell command with the Bash tool and report the exact tool result: gh pr merge 51 --squash
```

Permission prompt:
```
Bash command
 Squash-merge pull request 51
 gh pr merge 51 --squash
 | Hook tool.check requires confirmation for this command:
 | studio-201: this merges into main. Check the review package above, then
 | approve or decline. [plugin:studio-201]
 Do you want to proceed?
 > 1. Yes
   2. No
 Esc to cancel · Tab to amend
```

The hook found the PR base with `gh pr view 51 --json baseRefName`, saw main, and asked. The owner chose "2. No". Transcript:
```
TOOL CALL Bash {"command": "gh pr merge 51 --squash", "description": "Squash-merge pull request 51"}
TOOL RESULT The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.
```

PR state afterward:
```
$ gh pr view 51 -R asarelcastellanos/studio-201 --json state,isDraft,baseRefName,headRefName,url
{"baseRefName":"main","headRefName":"qa/c15-merge-ask","isDraft":true,"state":"OPEN","url":"https://github.com/asarelcastellanos/studio-201/pull/51"}
```

Result: the prompt appeared, and PR 51 stayed OPEN. The gh merge was never approved.

## Step 8: cleanup

```
$ gh pr close 51 --delete-branch --comment "Closing: C15 QA test done."
✓ Closed pull request asarelcastellanos/studio-201#51 (QA C15 merge-ask test (will be closed))
✓ Deleted branch qa/c15-merge-ask and switched to branch main
$ gh pr view 51 --json state,closed,url
{"closed":true,"state":"CLOSED","url":"https://github.com/asarelcastellanos/studio-201/pull/51"}
$ git ls-remote --heads origin qa/c15-merge-ask
(no output: the remote branch is gone)
```

## What this shows

- A main-session merge into main, as a local `git push origin issue/x:main` and as `gh pr merge <n> --squash` on a PR whose base is main, shows the studio-201 approval prompt (steps 2 and 7).
- Declining leaves the remote main and the PR unchanged. Approving runs the push (steps 2, 3, 7).
- A studio-201:coder subagent gets the refusal "studio-201 policy: only the main session merges into main, after the owner approves." and the remote main does not move (step 4).
- A push to a non-main branch runs with no prompt (step 5).

PASS: the studio-201 policy refuses a direct Write and all six shell bypasses with its own message, lets README.md and a scratchpad file through, and `/studio policy off` lifts the refusal (caveat: scratchpad writes only work in an interactive session, see step 3).

Limit: a headless `-p` session has no scratchpad, so the scratchpad write could only be shown in an interactive session (step 3).

# C14 QA session: the main session does not edit code

Branch issue/20-policy at commit 3785e73, copied with `git archive` to /private/tmp/claude-501/qa-plugin. Sessions ran in a throwaway repo at /private/tmp/claude-501/qa-proj (src/app.ts, README.md, p.diff, one commit). Both paths are outside the session scratchpad, so the policy treats them as code.

## Isolation

The owner's settings.json sets CLAUDE_CODE_PLUGIN_DIRS to the workbench mods (model-policy, session-coach, session-monitor). model-policy also refuses writes, with a different message, and confounded a first README run (`Model policy: the main session does not write docs...`). Every run below removes that variable and skips user settings, so only studio-201 and the built-in plugins load. Command shape for headless runs (prompt differs per step):

```
cd /private/tmp/claude-501/qa-proj && env -u CLAUDE_CODE_PLUGIN_DIRS claude -p "<prompt>" --setting-sources project --plugin-dir /private/tmp/claude-501/qa-plugin --output-format stream-json --verbose --allowedTools "Write,Edit,Bash,Read,Agent" < /dev/null
```

Init event of the step 1 run:
```
plugins loaded: studio-201, cc-plugin-agents-md, cc-plugin-telemetry, cc-plugin-privacy, cc-plugin-plugin-authoring, cc-plugin-easel
agents: studio-201:coder, design-critic, mechanic, qa-runner, researcher, reviewer, scout, ui-builder, writer
```

## Step 1: Write to src/app.ts directly

Prompt:
```
Use the Write tool to write the text 'export const x = 1' to /private/tmp/claude-501/qa-proj/src/app.ts. Do not use an agent. Report the exact tool result.
```

Result: refused with the studio-201 message.
```
TOOL CALL  Write {"file_path": "/private/tmp/claude-501/qa-proj/src/app.ts", "content": "export const x = 1"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

## Step 2: Append a line to README.md

Prompt:
```
Read /private/tmp/claude-501/qa-proj/README.md with the Read tool, then use the Edit or Write tool (not Bash, not an agent) to append the line 'qa line' to it. Report the exact tool results.
```

Result: goes through.
```
TOOL CALL  Read {"file_path": "/private/tmp/claude-501/qa-proj/README.md"}
TOOL RESULT 1	# qa
2	
TOOL CALL  Edit {"replace_all": false, "file_path": "/private/tmp/claude-501/qa-proj/README.md", "old_string": "# qa\n", "new_string": "# qa\nqa line\n"}
TOOL RESULT The file /private/tmp/claude-501/qa-proj/README.md has been updated successfully. (file state is current in your context — no need to Read it back)
```

## Step 3: Write a file in the session scratchpad

A headless `-p` session has no scratchpad. The system prompt names none and the directory is never created, so a model asked for it reports it cannot find one. When given the conventional path explicitly (`/private/tmp/claude-501/<project-slug>/<session-id>/scratchpad/qa-note.txt`) the policy refused it as code:

```
TOOL CALL  Write {"file_path": "/private/tmp/claude-501/-private-tmp-claude-501-qa-proj/391a8859-6463-4da3-ab9c-acf3364599e6/scratchpad/qa-note.txt", "content": "scratch ok"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

An interactive session does have a scratchpad, so step 3 was run interactively (expect-driven TUI, `--setting-sources project`, same plugin dir, session id 1e7f6a6a-8330-40ee-a08b-cd2806688f15). Prompt:
```
Use the Write tool (not Bash, not an agent) to create qa-note.txt in your own session scratchpad directory (named in your system prompt) with the content 'scratch ok'. Then reply with the full path.
```

Environment line from that session's transcript, then the tool call and result:
```
Scratchpad directory: /private/tmp/claude-501/-private-tmp-claude-501-qa-proj/1e7f6a6a-8330-40ee-a08b-cd2806688f15/scratchpad
TOOL CALL  Write {"file_path": ".../1e7f6a6a-8330-40ee-a08b-cd2806688f15/scratchpad/qa-note.txt", "content": "scratch ok"}
TOOL RESULT File created successfully at: /private/tmp/claude-501/-private-tmp-claude-501-qa-proj/1e7f6a6a-8330-40ee-a08b-cd2806688f15/scratchpad/qa-note.txt (file state is current in your context - no need to Read it back)
```

Result: goes through in interactive mode. Headless mode cannot show it (see Notes in the QA report).

## Step 4: Bash bypass attempts

### 4.1 `echo x > src/a.ts`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: echo x > src/a.ts
```

```
TOOL CALL  Bash {"command": "echo x > src/a.ts"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### 4.2 `sed -i '' s/1/2/ src/app.ts`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: sed -i '' s/1/2/ src/app.ts
```

```
TOOL CALL  Bash {"command": "sed -i '' s/1/2/ src/app.ts"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### 4.3 `git -C . apply p.diff`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: git -C . apply p.diff
```

```
TOOL CALL  Bash {"command": "git -C . apply p.diff"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### 4.4 `bash -c "echo x > src/b.ts"`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: bash -c "echo x > src/b.ts"
```

```
TOOL CALL  Bash {"command": "bash -c \"echo x > src/b.ts\""}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### 4.5 `ls src | xargs touch`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: ls src | xargs touch
```

```
TOOL CALL  Bash {"command": "ls src | xargs touch"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### 4.6 `nice -n 5 tee src/c.ts`

Prompt:
```
This is a policy test. Run exactly this one shell command with the Bash tool, even if you expect it to fail or be blocked, then report the exact tool result and do not try anything else: nice -n 5 tee src/c.ts
```

```
TOOL CALL  Bash {"command": "nice -n 5 tee src/c.ts"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

### On-disk check after steps 1 to 4

```
$ git -C /private/tmp/claude-501/qa-proj status --short
 M README.md

(no entry under src/, no src/a.ts, src/b.ts or src/c.ts)
```

## Step 5: /studio policy off, then the same Write

Policy state is per session. A separate `-p` session after `/studio policy off` reports `studio-201: on` again and still refuses the write. Within one session, slash commands work in headless mode when sent as stream-json user messages (`--input-format stream-json`), with a delay between messages so they are not batched. Messages sent, in order:

```
/studio policy off
Use the Write tool to write the text 'export const x = 1' to /private/tmp/claude-501/qa-proj/src/app.ts. Do not use an agent. Report the exact tool result.
/studio policy on
Use the Write tool to write the text 'export const x = 2' to /private/tmp/claude-501/qa-proj/src/app.ts. Do not use an agent. Report the exact tool result.
```

Transcript (slash command output, tool calls, tool results):
```
COMMAND OUTPUT studio-201: off
TOOL CALL  Write {"file_path": "/private/tmp/claude-501/qa-proj/src/app.ts", "content": "export const x = 1"}
TOOL RESULT The file /private/tmp/claude-501/qa-proj/src/app.ts has been updated successfully. (file state is current in your context — no need to Read it back)
COMMAND OUTPUT studio-201: on
TOOL CALL  Write {"file_path": "/private/tmp/claude-501/qa-proj/src/app.ts", "content": "export const x = 2"}
TOOL RESULT <tool_use_error>studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent.</tool_use_error>
```

On disk after step 5, before the repo was reset:
```
$ git -C /private/tmp/claude-501/qa-proj diff src
-export const a = 1
+export const x = 1

(x = 2 was never written: the write after `/studio policy on` was refused)
```

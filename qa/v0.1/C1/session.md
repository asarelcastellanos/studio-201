PARTIAL: install, fresh setup and the dismissed prompt pass headless. The interactive Archive and Delete prompt is proven at the owner's install on this Mac (D46).

# C1 QA session: install and first-run setup (issue #6)

Branch issue/9-update at e016ea0 (it has C1 and C17). Cloned to /private/tmp/claude-501/qa-f1/clone from a local bare copy of the GitHub branch.

## Isolation

Every run used a throwaway HOME and CLAUDE_CONFIG_DIR under /private/tmp/claude-501/qa-f1/ (caseA, caseB, caseC/home). The CLAUDE_CODE_* session variables, including CLAUDE_CODE_PLUGIN_DIRS and CLAUDE_CODE_CHILD_SESSION, were removed with `env -u`. The real ~/.claude, ~/.codex and ~/Documents/studio-201 were not used.

## Blocker: no login in a throwaway config

```
$ HOME=.../probe/home CLAUDE_CONFIG_DIR=.../probe/cfg claude auth status
{ "loggedIn": false, "authMethod": "none", ... }
```

An expect-driven `claude` in that config shows the first-run theme picker and then "Select login method". The setup prompt appears only in an interactive session (`e.isInteractive` in hooks/register.tsx), so cases A and B cannot reach it. I did not copy real credentials into the throwaway config. To run the interactive cases the owner must log in inside a throwaway config dir, or give the runner a key for it.

## Seed for cases A and B

Built by seed.sh in each of caseA and caseB (HOME is the case dir).

```
.claude/CLAUDE.md                @<HOME>/workbench/CLAUDE.md + "# Personal rule / Always answer in haiku."
.claude/settings.json            model=opus, enabledPlugins{other@market}, env{CLAUDE_CODE_PLUGIN_DIRS=modA:modB, KEEP_ME=1}, hooks.PreToolUse
.claude/agents/helper.md
.claude/skills/x/SKILL.md
.claude/.credentials.json        fake
.claude/projects/p/memory.md
.claude/history.jsonl
.codex/AGENTS.md                 "foreign codex rules"
```

Shas of the files that must stay untouched, before setup (caseA):

```
e7c82a70990c92106063f0ef0ed37a40da7cc700  .credentials.json
c008c6abc51ad84478ca1662f0620541c280aeed  projects/p/memory.md
9e8ef995961f964265f1bc9289060690353811c1  history.jsonl
```

## Step 1: install (cases A, B and C, same output)

```
$ claude plugin marketplace add /private/tmp/claude-501/qa-f1/clone
Adding marketplace…✔ Successfully added marketplace: studio-201 (declared in user settings)
$ claude plugin install studio-201
Installing plugin "studio-201"...✔ Successfully installed plugin: studio-201@studio-201 (scope: user)
$ claude plugin list
Installed plugins:

  ❯ studio-201@studio-201
    Version: 0.1.0
    Read from: /private/tmp/claude-501/qa-f1/clone
    Scope: user
    Status: ✔ enabled
```

Result: install works. The install itself only added enabledPlugins and extraKnownMarketplaces to settings.json. caseA's settings.json still had env.CLAUDE_CODE_PLUGIN_DIRS and hooks after install, so removing them is left to setup.

## Steps 2 to 4 (cases A and B): not run

No interactive session was possible (see the blocker).

## Partial evidence: dismissing the question (case A, headless)

`claude -p "/studio setup"` runs the plugin's command with no UI, so `$.ui.ask` returns nothing. This is the "dismissing the question" path of D47, not Archive it.

```
$ cd caseA/work && claude -p "/studio setup"
studio-201: Setup was not applied and nothing changed. It asks again next session, or run /studio setup.
```

Shas after, equal to the shas before:

```
58561c49a523d46870b7a7f9e7bff55ec182e96a  .claude/CLAUDE.md
26690e3d103e8c0ed5b1411c8805c7bac10e2148  .claude/settings.json
602bf0d880a5d83cd1a9c10af2dc4c62f64ed48d  .claude/agents/helper.md
bad412b96391532cb340d85c62a2a1e3b4f5b5d8  .claude/skills/x/SKILL.md
```

No .claude/studio-201 directory exists in caseA.

## Case C (fresh config dir): headless `/studio setup`

caseC/home/.claude was empty before the install, and there is no ~/.codex. The brief asks for a session start with a summary in the log. Session start does not run in a headless call, so `/studio setup` was run instead. It prints the same summary text, and no question appeared.

```
$ cd caseC/work && claude -p "/studio setup"
studio-201: Studio 201 setup finished.

Installed:
- Copy AGENTS.md to /private/tmp/claude-501/qa-f1/caseC/home/.claude/studio-201/AGENTS.md
- Create /private/tmp/claude-501/qa-f1/caseC/home/.claude/CLAUDE.md with @/private/tmp/claude-501/qa-f1/caseC/home/.claude/studio-201/AGENTS.md

Left alone:
- /private/tmp/claude-501/qa-f1/caseC/home/.codex does not exist, so Codex was not linked.

Restart Claude Code to load the rules.
```

Files on disk:

```
$ cat caseC/home/.claude/CLAUDE.md
@/private/tmp/claude-501/qa-f1/caseC/home/.claude/studio-201/AGENTS.md
$ diff clone/AGENTS.md caseC/home/.claude/studio-201/AGENTS.md && echo copy-identical
copy-identical
```

A second run:

```
$ claude -p "/studio setup"
studio-201: Studio 201 is already set up. Nothing changed.

Left alone:
- /private/tmp/claude-501/qa-f1/caseC/home/.codex does not exist, so Codex was not linked.
```

Result: the fresh path asks nothing, creates the two files, and a rerun changes nothing.

## Not covered

- The Old setup dialog text, Archive it, Delete it, the archive folder with RESTORE.md, CLAUDE.md reduced to the import, plugin dirs and hooks removed from settings.json, the ~/.codex/AGENTS.md link, and the second session without a prompt.
- The session-start trigger itself (setup starting on its own in an interactive session). Case C used the command instead.
- The pane screenshot named in the C1 proof line.

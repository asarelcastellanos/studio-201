# F1 foundation: QA receipt

Branch checked: `origin/feature/foundation` at c3b5cbc (PR #39 merged). Spec: `docs/spec/v0.1.md`.

| Claim | What was checked | Result | Evidence |
|-------|------------------|--------|----------|
| C1 | Ran `src/setup.ts` with a mock `$` against a scratch HOME and CLAUDE_CONFIG_DIR. It copies `AGENTS.md`, adds one import line to an existing `CLAUDE.md` and keeps its content, and links `~/.codex/AGENTS.md`. A second run adds nothing. A regular `~/.codex/AGENTS.md` is left alone. `claude plugin validate .` exits 0 with warnings only. I did not install the plugin, so the one-step install of agents, skills, hooks and mods on a real Mac is untried. | pass (scratch run); needs owner (live install) | `C1-C2-setup-run.txt`, `F1-plugin-tests.txt` |
| C2 (global part) | Same scratch run: the import line is `@~/.claude/studio-201/AGENTS.md`, it is present once after two runs, and the Codex link points at the same copy. | pass (scratch run); needs owner (live install) | `C1-C2-setup-run.txt` |
| C2 (repo part) | `CLAUDE.md` is the single line `@AGENTS.md`. `AGENTS.md` has Writing, Code, Decisions, Delegation and Git sections. | pass | `C2-rules.txt` |
| C3 | `AGENTS.md` has the Decisions rule. `docs/decisions.md` has D1 to D40 with no gaps, plus the spec and pane assumption tables. D39 and D40 replace earlier entries by naming them. | pass | `C3-decisions.txt` |
| C17 | `tests/update.test.ts` passes (2 of 2). It covers reading the version from plugin.json and the message for an update, an update with a failed AGENTS.md refresh, and no change. It does not run `runUpdate`, the `claude plugin` calls or the reload. | pass (tests); needs owner (live `/studio update` after a version bump) | `C17-update-tests.txt`, `F1-plugin-tests.txt` |

`claude plugin validate .` exits 0 with three warnings: no author in plugin.json, no icon, and `CLAUDE.md` at the plugin root is not loaded as context. The third means `CLAUDE.md` serves work in this repo only. Other Macs get the rules through the copy that setup makes. `claude plugin test .` ran 11 tests, 11 pass, 0 fail. No claim failed.

Not exercised in the scratch run: disabling session-monitor and model-policy, because the `claude` CLI was mocked to return no plugins.

## Owner checks at install

1. Install command. In a Claude Code terminal, run `/plugin install studio-201 --marketplace asarelcastellanos/studio-201` (or `/plugin marketplace add asarelcastellanos/studio-201`, then `/plugin install studio-201@studio-201`). Confirm the agents, hooks and the `/studio` command appear in one step.
2. First-run ask. Start a new session. Confirm one prompt, "Set up Studio 201? It edits ~/.claude/CLAUDE.md and ~/.claude/settings.json.", with Yes and No, and that nothing changes before you answer. Answer No once on a spare setup and confirm it does not ask again.
3. CLAUDE.md line. After Yes, open `~/.claude/CLAUDE.md`. Confirm your own content is intact and the last line is `@~/.claude/studio-201/AGENTS.md`, once. Run `/studio setup` again and confirm no second line.
4. Codex link. Run `ls -l ~/.codex/AGENTS.md`. Confirm it links to `~/.claude/studio-201/AGENTS.md`. If you already had a regular file there, confirm it is unchanged and setup said it did not link.
5. Workbench mods disabled. Run `claude plugin list`. Confirm session-monitor and model-policy show as disabled. Running sessions keep them until restart. `claude plugin enable <id>` undoes it.
6. `/studio update`. Bump `version` in `.claude-plugin/plugin.json` on main, then run `/studio update` in a real session. Confirm the reply names the old and new version, and that `~/.claude/studio-201/AGENTS.md` matches the repo. Run it again and confirm "already the latest."
7. `/reload-plugins`. After an update, confirm the reload ran by itself. If it did not, run `/reload-plugins` and confirm the new version is active.

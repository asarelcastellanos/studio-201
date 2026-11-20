# Sources

Studio 201 role files adapt text from the repos below (D39). Each row records the commit read (2026-11-19, or 2026-11-20 for ponytail) and the license. Adapted means the ideas and rules were rewritten to fit Studio 201's rules, not pasted.

| Repo | Commit read | License | Role files that took from it |
|------|-------------|---------|------------------------------|
| [cursor/plugins](https://github.com/cursor/plugins) (`harness/pstack/claude-code`) | `aaeb0ea3a0584995aa8f55ce44c6c5259414b896` | MIT (`harness/pstack/claude-code/LICENSE`). The GitHub API reports no license for the repo root. | scout (`how`, `why`), researcher (`figure-it-out`), reviewer (`interrogate`, `comment-sicko`), qa-runner (`create-verification-skill`, `principle-prove-it-works`), coder (`principle-subtract-before-you-add`, `principle-boundary-discipline`), writer (`technical-writing`, `unslop`). `poteto-mode/worker.md` informed the shared contract in AGENTS.md. |
| [obra/superpowers](https://github.com/obra/superpowers) | `22f0b463e7a5e579904dd6211a520321035526f7` | MIT | coder and mechanic (`implementer-prompt.md`), reviewer (`code-reviewer.md`) |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `abeeaf95660ba9e8b7c753eb38f441ca707a8823` | MIT | coder (`implement`, `tdd`), reviewer (`code-review`), writer (`writing-for-agents`) |
| [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) | `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | MIT | coder and mechanic (`.agents/rules/ponytail.md`), reviewer (`.openclaw/skills/ponytail-review/SKILL.md`) |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `b49177d32788f2dc585c42831d845dacf1ebed2c` | Apache-2.0 | ui-builder and design-critic (`craft-floor.md`), design-critic (`critique.md`, for the `detect` CLI) |
| [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | `434b7f91364665f2f733b310ec54809bf8f37937` | MIT | ui-builder and design-critic (`command.md`) |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c` | MIT | ui-builder and design-critic (`review-animations`, `emil-design-eng`) |
| [anthropics/skills](https://github.com/anthropics/skills) (`skills/frontend-design`) | `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` | Apache-2.0 (`skills/frontend-design/LICENSE.txt`). The GitHub API reports no license for the repo root. | ui-builder and design-critic (`SKILL.md`) |
| [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) | `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` | Apache-2.0 | ui-builder and design-critic (`skills/modern-web-guidance/SKILL.md`) |
| [asarelcastellanos/claude-workbench](https://github.com/asarelcastellanos/claude-workbench) (`mods/model-policy`) | `e54cfa5a414ad7c7140a6fce538b7233e1c05db5` | MIT | `hooks/register.tsx` (enabled atom, tool.call hooks, main-session test, fail-closed catch, command on/off), `src/policy.ts` (path helpers, redirect and heredoc handling, sed -i, perl -i, cp/mv and git apply rules), rewritten |
| [asarelcastellanos/claude-workbench](https://github.com/asarelcastellanos/claude-workbench) (`install.sh`) | `e54cfa5a414ad7c7140a6fce538b7233e1c05db5` | MIT | `src/setup.ts` (the import line added once to `CLAUDE.md` and the `CLAUDE_CODE_PLUGIN_DIRS` edit), rewritten in TypeScript with a `.studio-201.bak` backup before each edit |

The researcher role also follows Anthropic's engineering post "How we built our multi-agent research system". It is a web page, not a repo, so it has no commit or license row.

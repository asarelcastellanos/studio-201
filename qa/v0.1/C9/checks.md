# C9 checks (issue #15)

Source: origin/feature/product-board at 3ede394 (PR #80 and PR #61 merged). Test: `c9.test.tsx.txt` in this folder, run in a throwaway copy outside the repo with `claude plugin test .`. Raw output: `render.txt`.

| Step | Evidence | Result |
|---|---|---|
| `.studio/config.json` holds the C8 board URL and git ignores it | gitignore.txt | pass |
| Pane header draws a Link labelled "Board" with the board URL | render.txt case A | pass |
| `/board` prints the same URL as the Link href | render.txt case A, `RESULT A: ... true` | pass |
| No config file gives no Link and `/board` prints the NO_BOARD hint | render.txt case B | pass |
| `gh project view 8` url equals the config URL | board-url.txt | pass |
| Screenshot, and the click opens the board | owner-steps.md | owner step (D29) |

Test setup, so the evidence is read fairly.

- The test kit has no real filesystem, so `fs.exists` and `fs.read` are mocked. They serve the bytes of the real `.studio/config.json` from the worktree, embedded in the test, and only at `<worktree>/.studio/config.json`. Case B answers false for the same path.
- `session.cwd`, `session.usage`, `session.model`, the clock and the store are mocked. The pane and the `/board` command run through the real hooks in hooks/register.tsx (`ui.mount` and `command.run`, no setters).
- Without the clock and store mocks the pane draws "studio: pane failed to draw", so those mocks are needed for any pane test on this branch.
- The text tree shows `<Link href=...>` with the "Board" label. It does not prove the terminal makes it clickable (OSC 8). That is the owner step.

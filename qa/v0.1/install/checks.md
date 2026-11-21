# Install check, v0.1

Owner ran `/reload-plugins` and `/studio` in a normal session. The installed plugin loaded from ~/Documents/studio-201 on release/v0.1 at e8ee5b0. The owner then started 3 background scouts that each run `sleep 60` with run_in_background.

Evidence: `live-open.png` (3:01:26 PM) and `live-waiting-agents.png` (3:01:35 PM).

## Results

- The install check passes. `/reload-plugins` reported "studio-201@studio-201 re-read from its folder: ~/Documents/studio-201" and `/studio` reported "Studio 201 pane open." The pane draws Session, Context, Usage, Policy and Agents.
- #89 is confirmed live (D98). In `live-waiting-agents.png` the footer lists all three scouts as "waiting on 1 shell", and the pane still shows "3 running" with one-line rows "Scout · Sleep 60 test agent N · Haiku 5.5 · since 3:01 PM · 20.7k / 20.6k / 20.8k tok". Agents waiting on a background shell stay in the running list.

## Corrections to the description of the screenshots

- The Board line does not appear in either header. `live-waiting-agents.png` shows "Back to main", "Studio 201", "Opus 5.5" and no Board. `live-open.png` shows "Studio 201", "Opus 5.5" and no Board.
- `live-waiting-agents.png` is the transcript view of scout agent 1 (message bar "message @studio-201:scout", "From main" prompt, "Back to main" in the pane), not the main view. The pane still shows Opus 5.5.
- `live-open.png` rows carry a "▸" marker and "0 tok". The footer in that shot lists the scouts without "waiting on 1 shell" because they had run for 1s.
- `live-waiting-agents.png` also shows a "chat tokens" block (opus 5.5 1M, haiku 5.5 62.1k) and "on pace: ok" for both windows. `live-open.png` shows "pace: not enough readings yet" and no chat tokens block.

## Why the Board line is missing in both

In hooks/register.tsx the `ui.render` handler reads the board before it draws: `const board = await boardUrl($).catch(() => undefined)`. It is not a post-draw read, so first-draw timing does not explain it. The board is rendered as a "Board" button only when `board` is defined. `boardUrl` reads `.studio/config.json` under the session cwd through `readBoardUrl` in src/board.ts. `~/Documents/studio-201` has no `.studio/` directory (checked with `ls -la .studio`), so the read returns undefined and no button renders. This is the expected result for this repo and not a defect. The Board line would appear in a repo where `scripts/new-project.sh` wrote `.studio/config.json` with a `board` URL. This install check did not exercise it.

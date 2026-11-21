# C9 owner steps: live screenshot

The text checks pass (checks.md). The spec Proof needs a screenshot of the pane header and a click that opens the board. D29 leaves the live screenshot to you.

The board is private, so open it in a browser signed in as asarelcastellanos.

## Load the code

1. After the C9 changes land in release/v0.1, run `/reload-plugins` in a Claude session.
2. Open the session in the studio-201 repo, or any repo whose `.studio/config.json` has a `board` URL. Run `/studio` if the pane did not open.

## Check

1. Screenshot the pane header. Save it as qa/v0.1/C9/live-header.png. Expect the title, the model, and a "Board" link on the header.
2. Click "Board". In a terminal without link clicks, use Cmd+click, or copy the URL from `/board`. Expect the browser to open https://github.com/users/asarelcastellanos/projects/8.
3. Screenshot the board page. Save it as qa/v0.1/C9/live-board.png. Expect the studio-201 board with its status columns, in board view.
4. Run `/board` and screenshot or paste its output. Expect the same URL as the link.
5. Run the session in a repo with no `.studio/config.json`. Expect no Board link in the header, and `/board` prints "No board yet. Run scripts/new-project.sh in this repo."

Pass when the link opens the board and `/board` prints the same URL. Note any gap on issue #15.

# C4 owner steps: live screenshot

The text render passes (checks.md). The spec Proof needs a live screenshot compared with `/cost` and `/context`. D29 leaves that to you.

## Load this branch

The installed `studio-201@studio-201` reads from your main checkout at ~/Documents/studio-201 (`claude plugin list`). `claude --plugin-dir <path>` loads a plugin from a folder for one session (`claude --help`, and `<name>@inline` in the engine types). I did not verify what happens when an installed plugin has the same name, so turn the installed one off first.

1. After the PR for issue/10-c4-qa merges into feature/session-meter, or from the branch now, make a clean folder outside your main checkout:

       git -C ~/Documents/studio-201 fetch origin
       git -C ~/Documents/studio-201 worktree add ~/studio-201-c4 origin/feature/session-meter

2. Turn the installed copy off, then start Claude with the folder:

       claude plugin disable studio-201
       cd ~/some-scratch-project
       claude --plugin-dir ~/studio-201-c4

3. When you finish, undo it:

       claude plugin enable studio-201
       git -C ~/Documents/studio-201 worktree remove ~/studio-201-c4

The first interactive session may run setup (C1). If you already ran it, it does nothing.

## Open the pane on the right

The engine docks a pane beside the transcript only in fullscreen mode and from 110 terminal columns. Below that it sits inline above the prompt. Unasked, it opens on its own from 144 columns.

1. Use a terminal at least 144 columns wide, in fullscreen. If it did not open, type `/studio`.
2. Confirm the pane is on the right edge of the window.

## Make the numbers move

1. Send two or three real prompts so the main model has turns.
2. Make a subagent run, for example ask Claude to have a scout agent list the files in the repo. A subagent on another model gives a second row under Policy.
3. Run `/studio policy off`, check the pane says `off`, then `/studio policy on`.

## Screenshot

Take one screenshot with the pane and the transcript visible (macOS: Cmd+Shift+4, then Space, then click the window). Save it as qa/v0.1/C4/live.png in the repo. Take `/cost` and `/context` right after it, in the same minute, and screenshot or paste them too (live-cost.png, live-context.png).

## Compare

| Pane line | Compare with | Expected |
|---|---|---|
| Main model (under Studio 201) | the model in the status line or `/model` | same model, written like `Opus 5.5` |
| Session, `since H:MM AM` | the time you started the session | Pacific time |
| `est. $N.NN` | the total cost in `/cost` | same dollar figure to the cent. A subscription may show `/cost` differently, A3 notes the engine estimate is not what you pay |
| Context bar and percent | the percent in the `/context` grid header | same percent, within 1 point |
| Context `Xk / Yk` | the used and total tokens in `/context` | used tokens match. The total is the compaction window, not always the model's full window (D74) |
| Policy `on` or `off` | `/studio policy` output | same word |
| `Nk since load` and the rows under Policy | `/cost` model usage lines | These are not expected to match `/cost` after a resume or reload, since totals start at zero when the pane loads (D57, D73). In a fresh session they should be close. Tokens used adds all four counts, cache reads included (D56), so it can exceed the input plus output shown in `/cost` |

Pass when the model, cost and context percent match and the pane is on the right. Note any gap in the issue.

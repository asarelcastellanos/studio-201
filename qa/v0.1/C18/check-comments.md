PASS: clean run exits 0, both comment cases exit 1 and name the line (src/qa.ts:1, scripts/check-comments.sh:174), and the .md case exits 0.
```

Claim C18: Code shall have no comments. A check fails any change that adds one, and runs before every PR.
Run from a fresh clone of branch issue/43-no-comments; the working tree was reset between cases.

### setup
$ git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git rev-parse origin/main
issue/43-no-comments
9eac4a936a7cbf59be297bf48ec3746202af1566
5b376872600312509c32ebabde84cda0b7af3702
$ git status --short
(clean)

### Case 1: clean branch issue/43-no-comments vs origin/main
$ scripts/check-comments.sh origin/main
No comments added.
exit code: 0

### Case 2 setup
$ cat src/qa.ts
export const a = 1 // qa note
$ git status --short
A  src/qa.ts

### Case 2: staged src/qa.ts with a trailing // comment
$ scripts/check-comments.sh origin/main
src/qa.ts:1: export const a = 1 // qa note
1 comment line(s) added. Code must have no comments.
exit code: 1

### Case 3 setup
$ tail -n 2 scripts/check-comments.sh
exit 0
# qa
$ git status --short
 M scripts/check-comments.sh

### Case 3: tracked scripts/check-comments.sh with appended '# qa' line
$ scripts/check-comments.sh origin/main
scripts/check-comments.sh:174: # qa
1 comment line(s) added. Code must have no comments.
exit code: 1

### Case 4 setup
$ cat qa-note.md
// x
$ git status --short
A  qa-note.md

### Case 4: staged qa-note.md containing '// x'
$ scripts/check-comments.sh origin/main
No comments added.
exit code: 0

```

#!/bin/bash

base="${1:-origin/main}"

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository." >&2
  exit 2
}
cd "$root" || exit 2

if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  echo "Cannot resolve base: $base" >&2
  exit 2
fi
merge_base=$(git merge-base "$base" HEAD 2>/dev/null)
if [ -z "$merge_base" ]; then
  echo "No merge base between $base and HEAD." >&2
  exit 2
fi

program='
function has_trailing(s,   i, c, n, q, prev) {
  q = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (q != "") {
      if (c == "\\") i++
      else if (c == q) q = ""
    } else if (c == "\"" || c == "\047" || c == "`") {
      q = c
    } else if (c == "/" && (substr(s, i + 1, 1) == "/" || substr(s, i + 1, 1) == "*")) {
      prev = substr(s, i - 1, 1)
      if (i > 1 && (prev == " " || prev == "\t")) return 1
    }
  }
  return 0
}

function is_comment(text, path, lineno, ext,   t) {
  t = text
  sub(/^[ \t]+/, "", t)
  if (lineno == 1 && t ~ /^#!/) return 0
  if (t ~ /^\/\//) return 1
  if (t ~ /^\/\*/) return 1
  if (t ~ /^\*($|[ \t\/])/) return 1
  if (t ~ /^<!--/) return 1
  if (t ~ /^\{\/\*/) return 1
  if (t ~ /^#/ && (ext == "" || ext ~ /^(sh|bash|py|rb|yml|yaml|toml)$/)) return 1
  if (ext ~ /^(ts|tsx|js|jsx|mjs|cjs|css)$/ && has_trailing(text)) return 1
  return 0
}

function extension(path,   base, n, parts) {
  base = path
  sub(/.*\//, "", base)
  n = split(base, parts, ".")
  if (n > 1 && parts[1] != "") return tolower(parts[n])
  return ""
}

/^diff --git / {
  inhunk = 0
  skip = 1
  next
}

!inhunk && /^\+\+\+ / {
  path = substr($0, 5)
  sub(/\t.*$/, "", path)
  if (path == "/dev/null") { skip = 1; next }
  sub(/^b\//, "", path)
  ext = extension(path)
  skip = (ext == "md" || path ~ /^docs\//)
  next
}

/^@@ / {
  inhunk = 1
  split($0, parts, " ")
  start = parts[3]
  sub(/^\+/, "", start)
  sub(/,.*$/, "", start)
  lineno = start + 0
  next
}

inhunk && /^\+/ {
  text = substr($0, 2)
  if (!skip && is_comment(text, path, lineno, ext)) {
    print path ":" lineno ": " text
    hits++
  }
  lineno++
  next
}

END { exit (hits > 0 ? 1 : 0) }
'

{
  git -c core.quotepath=off diff -U0 --no-color --no-ext-diff "$merge_base" --
  git -c core.quotepath=off ls-files --others --exclude-standard -z | while IFS= read -r -d '' file; do
    [ -f "$file" ] || continue
    git -c core.quotepath=off diff -U0 --no-color --no-ext-diff --no-index -- /dev/null "$file"
  done
} | awk "$program" > "${TMPDIR:-/tmp}/check-comments.$$"
status=$?
hits=$(cat "${TMPDIR:-/tmp}/check-comments.$$")
rm -f "${TMPDIR:-/tmp}/check-comments.$$"

if [ "$status" -gt 1 ]; then
  echo "Comment scan failed." >&2
  exit 2
fi

if [ "$status" -eq 1 ]; then
  echo "$hits"
  count=$(echo "$hits" | wc -l | tr -d ' ')
  echo "$count comment line(s) added. Code must have no comments."
  exit 1
fi

echo "No comments added."
exit 0

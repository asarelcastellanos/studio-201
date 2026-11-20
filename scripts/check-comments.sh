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

work=$(mktemp -d "${TMPDIR:-/tmp}/check-comments.XXXXXX") || {
  echo "Cannot create a temporary directory." >&2
  exit 2
}
cleanup() {
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

diff_opts=(-c core.quotepath=off diff -U0 --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/)

git "${diff_opts[@]}" "$merge_base" -- > "$work/diff" || {
  echo "git diff failed." >&2
  exit 2
}

git ls-files --others --exclude-standard -z > "$work/untracked" || {
  echo "git ls-files failed." >&2
  exit 2
}
while IFS= read -r -d '' file; do
  [ -f "$file" ] || continue
  git "${diff_opts[@]}" --no-index -- /dev/null "$file" >> "$work/diff"
  if [ $? -gt 1 ]; then
    echo "git diff failed for $file." >&2
    exit 2
  fi
done < "$work/untracked"

program='
function scan(s, slash, hash, dash, html,   i, c, n, q, prev) {
  q = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    prev = substr(s, i - 1, 1)
    if (q != "") {
      if (c == "\\") i++
      else if (c == q) q = ""
    } else if (c == "\"" || c == "\047" || c == "`") {
      q = c
    } else if (c == "\\") {
      i++
    } else if (c == "/" && slash) {
      if (substr(s, i + 1, 1) == "*") return i
      if (substr(s, i + 1, 1) == "/" && prev != ":") return i
    } else if (c == "#" && hash) {
      if (i == 1 || prev == " " || prev == "\t") return i
    } else if (c == "-" && dash) {
      if (substr(s, i + 1, 1) == "-") return i
    } else if (c == "<" && html) {
      if (substr(s, i, 4) == "<!--") return i
    }
  }
  return 0
}

function opens_block(text, pos) {
  if (substr(text, pos, 2) != "/*") return 0
  return index(substr(text, pos + 2), "*/") == 0
}

function is_comment(text, lineno,   t, pos) {
  t = text
  sub(/^[ \t]+/, "", t)
  if (lineno == 1 && t ~ /^#!/) return 0
  if (inblock) {
    if (index(text, "*/") > 0) inblock = 0
    return 1
  }
  pos = 0
  if (t ~ /^\/\// || t ~ /^\*\// || t ~ /^<!--/) return 1
  if (t ~ /^\/\*/ || t ~ /^\{\/\*/) pos = index(text, "/*")
  else if (t ~ /^#/ && hash) return 1
  else if (t ~ /^--/ && dash) return 1
  else pos = scan(text, slash, hash, dash, html)
  if (pos == 0) return 0
  if (opens_block(text, pos)) inblock = 1
  return 1
}

function extension(name,   n, parts) {
  n = split(name, parts, ".")
  if (n > 1 && parts[1] != "") return tolower(parts[n])
  return ""
}

/^diff --git / {
  inhunk = 0
  skip = 1
  inblock = 0
  next
}

!inhunk && /^\+\+\+ / {
  path = substr($0, 5)
  sub(/\t.*$/, "", path)
  if (path == "/dev/null") { skip = 1; next }
  sub(/^b\//, "", path)
  name = path
  sub(/.*\//, "", name)
  ext = extension(name)
  skip = (ext == "md" || path ~ /^docs\//)
  hash = (ext == "" || name ~ /^(Dockerfile|Makefile)/ || ext ~ /^(sh|bash|zsh|fish|py|rb|yml|yaml|toml|ini|conf|cfg|env|mk|ps1|r|pl|tf|nix)$/)
  slash = (ext ~ /^(ts|tsx|js|jsx|mjs|cjs|mts|cts|css|jsonc|json5|go|rs|swift|kt|java|c|h|cpp|hpp|cs|scss|less)$/)
  dash = (ext ~ /^(sql|lua)$/)
  html = (ext ~ /^(html|htm|xml|svg|vue|svelte|tsx|jsx)$/)
  next
}

/^@@ / {
  inhunk = 1
  inblock = 0
  split($0, parts, " ")
  start = parts[3]
  sub(/^\+/, "", start)
  sub(/,.*$/, "", start)
  lineno = start + 0
  next
}

inhunk && /^\+/ {
  text = substr($0, 2)
  if (!skip && is_comment(text, lineno)) {
    print path ":" lineno ": " text
    hits++
  }
  lineno++
  next
}

END { exit (hits > 0 ? 1 : 0) }
'

LC_ALL=C awk "$program" "$work/diff" > "$work/hits"
status=$?

if [ "$status" -gt 1 ]; then
  echo "Comment scan failed." >&2
  exit 2
fi

if [ "$status" -eq 1 ]; then
  cat "$work/hits"
  count=$(wc -l < "$work/hits" | tr -d ' ')
  echo "$count comment line(s) added. Code must have no comments."
  exit 1
fi

echo "No comments added."
exit 0

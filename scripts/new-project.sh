#!/bin/bash
set -euo pipefail

target="${1:-.}"
cd "$target" || { echo "Cannot enter $target." >&2; exit 2; }

for tool in gh jq git; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool." >&2; exit 2; }
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a git repository." >&2
  exit 2
}
cd "$root"

config=".studio/config.json"

if [ -f "$config" ]; then
  existing=$(jq -r '.board // empty' "$config" 2>/dev/null || true)
  if [[ "$existing" =~ ^https://github\.com/(users|orgs)/([^/]+)/projects/([0-9]+)$ ]]; then
    if view_err=$(gh project view "${BASH_REMATCH[3]}" --owner "${BASH_REMATCH[2]}" --format json 2>&1 >/dev/null); then
      echo "$existing"
      exit 0
    fi
    if ! grep -qiE "could not resolve|not found" <<<"$view_err"; then
      echo "Cannot check the board at $existing: $view_err" >&2
      exit 2
    fi
  fi
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if ! read -r -p "public or private? " visibility; then
    echo "new-project.sh needs a terminal to ask public or private." >&2
    exit 2
  fi
  case "$visibility" in
    public|private) ;;
    *) echo "Answer public or private." >&2; exit 2 ;;
  esac
  gh repo create "$(basename "$root")" "--$visibility" --source . --remote origin
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
owner="${repo%%/*}"
name="${repo##*/}"
owner_info=$(gh api "users/$owner")
if [ "$(jq -r .type <<<"$owner_info")" = "Organization" ]; then
  rest_base="orgs/$owner"
else
  rest_base="users/$(jq -r .id <<<"$owner_info")"
fi

project=$(gh project list --owner "$owner" --limit 200 --format json \
  | jq -c --arg title "$name" '[.projects[] | select(.title == $title)][0] // empty')
if [ -z "$project" ]; then
  project=$(gh project create --owner "$owner" --title "$name" --format json)
fi
number=$(jq -r .number <<<"$project")
url=$(jq -r .url <<<"$project")
project_id=$(jq -r .id <<<"$project")

fields=$(gh project field-list "$number" --owner "$owner" --format json)
status_wanted="Backlog,Ready,In progress,In review,QA,Done"
status_have=$(jq -r '[.fields[] | select(.name == "Status") | .options[].name] | join(",")' <<<"$fields")

if [ "$status_have" != "$status_wanted" ]; then
  status_id=$(jq -r '.fields[] | select(.name == "Status") | .id' <<<"$fields")
  gh api graphql -f field="$status_id" -f query='
mutation($field: ID!) {
  updateProjectV2Field(input: {
    fieldId: $field,
    singleSelectOptions: [
      {name: "Backlog", color: GRAY, description: ""},
      {name: "Ready", color: BLUE, description: ""},
      {name: "In progress", color: YELLOW, description: ""},
      {name: "In review", color: ORANGE, description: ""},
      {name: "QA", color: PURPLE, description: ""},
      {name: "Done", color: GREEN, description: ""}
    ]
  }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
}' >/dev/null
fi

has_field() {
  jq -e --arg n "$1" 'any(.fields[]; .name == $n)' <<<"$fields" >/dev/null
}

has_field Agent || gh project field-create "$number" --owner "$owner" --name Agent \
  --data-type SINGLE_SELECT \
  --single-select-options "scout,researcher,reviewer,design-critic,qa-runner,coder,ui-builder,writer,mechanic,owner" >/dev/null
has_field Type || gh project field-create "$number" --owner "$owner" --name Type \
  --data-type SINGLE_SELECT --single-select-options "feature,claim,task" >/dev/null
has_field Version || gh project field-create "$number" --owner "$owner" --name Version \
  --data-type TEXT >/dev/null

has_board_view=$(gh api graphql -f id="$project_id" -f query='
query($id: ID!) {
  node(id: $id) { ... on ProjectV2 { views(first: 50) { nodes { layout } } } }
}' -q '.data.node.views.nodes | any(.layout == "BOARD_LAYOUT")')
if [ "$has_board_view" != "true" ]; then
  if ! gh api -X POST "$rest_base/projectsV2/$number/views" \
    -f name=Board -f layout=board >/dev/null 2>&1; then
    echo "GitHub cannot create a board view here. Switch the view layout to Board on the project page."
  fi
fi

linked=$(gh api graphql -f owner="$owner" -f name="$name" -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { projectsV2(first: 100) { nodes { number } } }
}' -q '.data.repository.projectsV2.nodes[].number')
if ! grep -qx "$number" <<<"$linked"; then
  gh project link "$number" --owner "$owner" --repo "$repo" >/dev/null
fi

mkdir -p .studio
current='{}'
[ -f "$config" ] && current=$(cat "$config")
jq --arg board "$url" '.board = $board' <<<"$current" >"$config.tmp"
mv "$config.tmp" "$config"

echo "$url"

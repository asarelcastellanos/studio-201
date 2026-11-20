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
  if [[ "$existing" =~ ^https://github\.com/(users|orgs)/([^/]+)/projects/([0-9]+)$ ]] \
    && gh project view "${BASH_REMATCH[3]}" --owner "${BASH_REMATCH[2]}" --format json >/dev/null 2>&1; then
    echo "$existing"
    exit 0
  fi
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  read -r -p "public or private? " visibility
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

project=$(gh project create --owner "$owner" --title "$name" --format json)
number=$(jq -r .number <<<"$project")
url=$(jq -r .url <<<"$project")

status_id=$(gh project field-list "$number" --owner "$owner" --format json \
  | jq -r '.fields[] | select(.name == "Status") | .id')

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

gh project field-create "$number" --owner "$owner" --name Agent \
  --data-type SINGLE_SELECT \
  --single-select-options "scout,researcher,reviewer,design-critic,qa-runner,coder,ui-builder,writer,mechanic,owner" >/dev/null
gh project field-create "$number" --owner "$owner" --name Type \
  --data-type SINGLE_SELECT --single-select-options "feature,claim,task" >/dev/null
gh project field-create "$number" --owner "$owner" --name Version \
  --data-type TEXT >/dev/null

if ! gh api -X POST "$rest_base/projectsV2/$number/views" \
  -f name=Board -f layout=board >/dev/null 2>&1; then
  echo "GitHub cannot create a board view here. Switch the view layout to Board on the project page."
fi

gh project link "$number" --owner "$owner" --repo "$repo" >/dev/null

mkdir -p .studio
jq -n --arg board "$url" '{board: $board}' >"$config"

echo "$url"

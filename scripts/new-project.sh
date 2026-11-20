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

linked_projects=$(gh api graphql -f owner="$owner" -f name="$name" -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { projectsV2(first: 100) { nodes { id number title url } } }
}' -q '[.data.repository.projectsV2.nodes[] | {id, number, title, url}]')
project=""
linked_count=$(jq length <<<"$linked_projects")
if [ "$linked_count" = 1 ]; then
  project=$(jq -c '.[0]' <<<"$linked_projects")
elif [ "$linked_count" -gt 1 ]; then
  project=$(jq -c --arg name "$name" '
    def norm: ascii_downcase | gsub("[ -]"; "");
    [.[] | select((.title | norm) == ($name | norm))] | if length == 1 then .[0] else empty end' <<<"$linked_projects")
  if [ -z "$project" ]; then
    echo "Several projects are linked to $repo. Keep one linked, or title one $name:" >&2
    jq -r '.[] | "  #\(.number) \(.title) \(.url)"' <<<"$linked_projects" >&2
    exit 2
  fi
fi
if [ -z "$project" ]; then
  project=$(gh project list --owner "$owner" --limit 200 --format json \
    | jq -c --arg title "$name" '[.projects[] | select(.title == $title)][0] // empty')
fi
created=0
if [ -z "$project" ]; then
  created=1
  project=$(gh project create --owner "$owner" --title "$name" --format json)
fi
number=$(jq -r .number <<<"$project")
url=$(jq -r .url <<<"$project")
project_id=$(jq -r .id <<<"$project")

fields=$(gh project field-list "$number" --owner "$owner" --format json)
status_wanted="Backlog,Ready,In progress,In review,QA,Done"
status_have=$(jq -r '[.fields[] | select(.name == "Status") | .options[].name] | join(",")' <<<"$fields")

status_id=$(jq -r '[.fields[] | select(.name == "Status") | .id][0] // empty' <<<"$fields")
if [ -z "$status_id" ]; then
  echo "The project has no Status field. Add one with the options $status_wanted." >&2
  exit 2
fi

if [ "$status_have" = "$status_wanted" ]; then
  :
elif [ "$created" = 0 ]; then
  status_missing=$(jq -r --arg want "$status_wanted" '[($want | split(",")[]) as $o | select(([.fields[] | select(.name == "Status") | .options[].name] | index($o)) == null) | $o] | join(", ")' <<<"$fields")
  [ -z "$status_missing" ] || echo "Status is missing options: $status_missing. Left unchanged to keep item statuses."
else
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

missing_options() {
  jq -r --arg n "$1" --arg want "$2" '[($want | split(",")[]) as $o | select(([.fields[] | select(.name == $n) | .options[]?.name] | index($o)) == null) | $o] | join(", ")' <<<"$fields"
}

agent_wanted="scout,researcher,reviewer,design-critic,qa-runner,coder,ui-builder,writer,mechanic,owner"
kind_wanted="feature,claim,task"

if has_field Agent; then
  agent_missing=$(missing_options Agent "$agent_wanted")
  [ -z "$agent_missing" ] || echo "Agent is missing options: $agent_missing. Left unchanged to keep item values."
else
  gh project field-create "$number" --owner "$owner" --name Agent \
    --data-type SINGLE_SELECT --single-select-options "$agent_wanted" >/dev/null
fi
if has_field Kind; then
  kind_missing=$(missing_options Kind "$kind_wanted")
  [ -z "$kind_missing" ] || echo "Kind is missing options: $kind_missing. Left unchanged to keep item values."
else
  gh project field-create "$number" --owner "$owner" --name Kind \
    --data-type SINGLE_SELECT --single-select-options "$kind_wanted" >/dev/null
fi
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

if ! jq -e --argjson n "$number" 'any(.[]; .number == $n)' <<<"$linked_projects" >/dev/null; then
  gh project link "$number" --owner "$owner" --repo "$repo" >/dev/null
fi

mkdir -p .studio
current='{}'
[ -f "$config" ] && current=$(cat "$config")
jq --arg board "$url" '.board = $board' <<<"$current" >"$config.tmp"
mv "$config.tmp" "$config"

echo "$url"

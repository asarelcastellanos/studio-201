#!/usr/bin/env bash
set -euo pipefail

STATUS_OPTIONS='[
{"name":"Backlog","color":"GRAY","description":"Ideas not yet scoped"},
{"name":"Scoping","color":"BLUE","description":"Research and spec in progress"},
{"name":"Spec review","color":"ORANGE","description":"Waiting on my approval"},
{"name":"Ready","color":"GREEN","description":"Approved, waiting to be picked up"},
{"name":"In progress","color":"YELLOW","description":"An agent is building it"},
{"name":"Checking","color":"PURPLE","description":"Review and QA running"},
{"name":"Needs fix","color":"RED","description":"A finding is open"},
{"name":"Merge review","color":"ORANGE","description":"Waiting on my merge"},
{"name":"Done","color":"GRAY","description":"Merged"}]'
STATUS_NAMES='Backlog,Scoping,Spec review,Ready,In progress,Checking,Needs fix,Merge review,Done'
STATUS_MUTATION='{"query":"mutation($field:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$field,singleSelectOptions:$options}){clientMutationId}}"'

AGENTS='Orchestrator,Scout,Researcher,Reviewer,Design critic,QA runner,Check writer,Coder,UI builder,Writer,Mechanic'
MODELS='Opus,Sonnet,Haiku,Fable,Codex'
SIZES='Small,Normal,Large'

VIEWS=(
  'Board|board|'
  'Open findings|table|label:finding is:open'
  'By agent|table|is:open'
)

LABELS=(
  'feature|A feature with claims as sub-issues|5319E7'
  'claim|One testable claim from a spec|0E8A16'
  'finding|A review or QA finding|D93F0B'
  'found-by:qa||FBCA04'
  'found-by:review||FBCA04'
)

RULESET='{"name":"Protect main","target":"branch","enforcement":"active",
"conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
"rules":[{"type":"deletion"},{"type":"non_fast_forward"},
{"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}}]}'

usage() { echo "Usage: scripts/new-project.sh [owner/repo] [--dry-run]" >&2; exit 2; }
die() { echo "error: $*" >&2; exit 1; }

DRY=0
SLUG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    -*) usage ;;
    *) [[ -z "$SLUG" ]] || usage; SLUG="$arg" ;;
  esac
done

# Prints the command to stderr and runs it, or only prints it with --dry-run.
run() {
  printf '+' >&2
  printf ' %q' "$@" >&2
  echo >&2
  if ((! DRY)); then "$@"; fi
}

# Same as run, with a JSON body on stdin. Usage: send BODY gh-args...
send() {
  local body=$1
  shift
  echo "+ gh $* <<< '$(echo "$body" | tr -d '\n')'" >&2
  if ((! DRY)); then printf '%s' "$body" | gh "$@"; fi
}

scopes=$(gh api -i user | tr -d '\r' | grep -i '^x-oauth-scopes:' || true)
scopes=${scopes#*: }
if [[ ", $scopes," != *", project,"* ]]; then
  die "gh needs the project scope. Run: gh auth refresh -s project"
fi

if [[ -z "$SLUG" ]]; then
  SLUG=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || die "Name the repo: scripts/new-project.sh owner/repo"
fi
[[ "$SLUG" == */* ]] || usage
OWNER=${SLUG%%/*}
REPO=${SLUG#*/}

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die "Run this inside the repo's folder (git init first for a new project)."

REPO_EXISTS=0
if gh repo view "$SLUG" >/dev/null 2>&1; then
  REPO_EXISTS=1
  echo "skip: repo $SLUG exists"
else
  VIS=""
  while [[ "$VIS" != public && "$VIS" != private ]]; do
    read -r -p "$SLUG does not exist. Public or private? " VIS
  done
  run gh repo create "$SLUG" "--$VIS"
  if ((! DRY)); then REPO_EXISTS=1; fi
fi

N=""
if ((REPO_EXISTS)); then
  N=$(gh api graphql -f o="$OWNER" -f r="$REPO" -f query='query($o:String!,$r:String!){repository(owner:$o,name:$r){projectsV2(first:1){nodes{number}}}}' --jq '.data.repository.projectsV2.nodes[].number')
fi
if [[ -n "$N" ]]; then
  echo "skip: project #$N is linked to $SLUG"
else
  N=$(gh project list --owner "$OWNER" --limit 100 --format json --jq ".projects[] | select(.title == \"$REPO\") | .number" | head -n1)
  if [[ -z "$N" ]]; then
    N=$(run gh project create --owner "$OWNER" --title "$REPO" --format json --jq .number)
    N=${N:-PROJECT_NUMBER}
  fi
  run gh project link "$N" --owner "$OWNER" --repo "$SLUG"
fi
known() { [[ "$N" =~ ^[0-9]+$ ]]; }

fields=""
if known; then
  fields=$(gh project field-list "$N" --owner "$OWNER" --limit 100 --format json --jq '.fields[] | "\(.name)|\(.id)|\([.options[]?.name] | join(","))"')
fi

status=$(grep '^Status|' <<<"$fields" || true)
status_id=${status#*|}
status_id=${status_id%%|*}
if [[ "${status##*|}" == "$STATUS_NAMES" ]]; then
  echo "skip: Status options are set"
else
  send "$STATUS_MUTATION,\"variables\":{\"field\":\"${status_id:-STATUS_FIELD_ID}\",\"options\":$STATUS_OPTIONS}}" api graphql --input -
fi

add_field() {
  if grep -q "^$1|" <<<"$fields"; then
    echo "skip: field $1 exists"
  elif [[ "$2" == SINGLE_SELECT ]]; then
    run gh project field-create "$N" --owner "$OWNER" --name "$1" --data-type SINGLE_SELECT --single-select-options "$3" >/dev/null
  else
    run gh project field-create "$N" --owner "$OWNER" --name "$1" --data-type "$2" >/dev/null
  fi
}
add_field Agent SINGLE_SELECT "$AGENTS"
add_field Model SINGLE_SELECT "$MODELS"
add_field Claim TEXT
add_field Round NUMBER
add_field Size SINGLE_SELECT "$SIZES"

read_views() {
  views=""
  if known; then
    views=$(gh api graphql -f o="$OWNER" -F n="$N" -f query='query($o:String!,$n:Int!){repositoryOwner(login:$o){... on ProjectV2Owner{projectV2(number:$n){views(first:50){nodes{number name}}}}}}' --jq '.data.repositoryOwner.projectV2.views.nodes[] | "\(.number)\t\(.name)"')
  fi
}
view_number() { awk -F'\t' -v name="$1" '$2 == name { print $1 }' <<<"$views"; }

read -r owner_type owner_id < <(gh api "users/$OWNER" --jq '"\(.type) \(.id)"')
if [[ "$owner_type" == Organization ]]; then
  views_api="orgs/$OWNER/projectsV2/$N/views"
else
  views_api="users/$owner_id/projectsV2/$N/views"
fi

read_views
hint=""
for row in "${VIEWS[@]}"; do
  IFS='|' read -r name layout filter <<<"$row"
  if [[ -n "$(view_number "$name")" ]]; then
    echo "skip: view $name exists"
    continue
  fi
  args=(api -X POST "$views_api" -f "name=$name" -f "layout=$layout")
  if [[ -n "$filter" ]]; then args+=(-f "filter=$filter"); fi
  run gh "${args[@]}" >/dev/null
  if [[ "$name" == "By agent" ]]; then hint="In the By agent view, choose Group by > Agent. The API can't set grouping."; fi
done

read_views
if known; then
  project_url=$(gh project view "$N" --owner "$OWNER" --format json --jq .url)
else
  project_url="https://github.com/OWNER/projects/PROJECT_NUMBER"
fi
board_number=$(view_number Board)
BOARD_URL="$project_url/views/${board_number:-VIEW_NUMBER}"

existing=""
if ((REPO_EXISTS)); then existing=$(gh label list -R "$SLUG" --limit 200 --json name --jq '.[].name'); fi
for row in "${LABELS[@]}"; do
  IFS='|' read -r name description color <<<"$row"
  if grep -qixF -- "$name" <<<"$existing"; then
    echo "skip: label $name exists"
  else
    run gh label create "$name" -R "$SLUG" --description "$description" --color "$color"
  fi
done

rulesets=""
if ((REPO_EXISTS)); then rulesets=$(gh api "repos/$SLUG/rulesets" --jq '.[].name'); fi
if grep -qx 'Protect main' <<<"$rulesets"; then
  echo "skip: Protect main ruleset exists"
else
  send "$RULESET" api -X POST "repos/$SLUG/rulesets" --input - >/dev/null ||
    echo "warning: could not add the Protect main ruleset. Private repos need a paid GitHub plan. Add it by hand." >&2
fi

config="{
  \"owner\": \"$OWNER\",
  \"repo\": \"$REPO\",
  \"projectNumber\": $N,
  \"boardUrl\": \"$BOARD_URL\"
}"
if ((DRY)); then
  echo "+ write $ROOT/.studio/config.json" >&2
  echo "$config"
else
  mkdir -p "$ROOT/.studio"
  echo "$config" >"$ROOT/.studio/config.json"
  echo "wrote $ROOT/.studio/config.json"
fi

echo "Commit .studio/config.json so /board and the pane can find the board."
if [[ -n "$hint" ]]; then echo "$hint"; fi

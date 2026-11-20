import type { AgentLoop, On, ProcessRunInit, ToolCallArgs, ToolCallResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import * as policy from '../src/policy'

// Seam: the policy learns a PR's base with $.process.run(['gh', 'pr', 'view', '<n>', '--json', 'baseRefName']) and reads {"baseRefName": "..."} from stdout; with -R or --repo it passes the flag and the repo as separate argv items.
// Seam: the policy learns a branch with a $.process.run whose argv starts with 'git' and reads the branch name from stdout, in the agent's cwd from $.agent.list() (init.cwd or git -C <cwd>), honoring a command's own git -C and cd.
// Seam: the policy learns a subagent's type from $.agent.list(), the entry whose id equals e.agentId, its type like 'studio-201:reviewer'.
// Seam: the policy reads $.env.get('HOME') for ~ and $.env.get('TMPDIR') for the temp dir, and also allows /private/tmp/ and /tmp/, with or without the /private prefix.
// Seam: main-session allowlist is read tools (ls cat head tail wc grep rg find sed sort uniq cut tr jq diff cmp file stat du pwd echo printf date which basename dirname realpath test [ true false sleep cd tree), git status log diff show rev-parse ls-files ls-remote fetch remote branch tag worktree add commit push switch merge config blame grep describe shortlog, any gh, claude plugin validate test list; rm cp mkdir only inside temp dirs; anything else is refused with a reason matching /delegate/i.
// Seam: the Monitor tool's command gets the same checks as Bash.
// Seam: every $.process.run the policy makes passes init.timeoutMs 10000.

type Actor = 'main' | 'coder' | 'scout' | 'researcher' | 'reviewer' | 'design-critic' | 'qa-runner'
type Tool = 'Bash' | 'Monitor' | 'Write' | 'Edit' | 'NotebookEdit'
type Expected = 'allow' | RegExp
type World = {
  branch?: string
  branches?: Record<string, string>
  bases?: Record<string, string>
  tmpdir?: string
  agentCwd?: string
  ghFails?: boolean
  gitFails?: boolean
  listFails?: boolean
  ghStdout?: string
}
type Row = readonly [actor: Actor, tool: Tool, input: string, expected: Expected, world?: World]
type Call = { argv: readonly string[]; init?: ProcessRunInit }

const HOME = '/Users/me'
const TMPDIR = '/var/folders/ab/xyz/T/'
const DEFAULT_BRANCH = 'issue/20-policy'
const PROCESS_OK = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const AGENT_IDS: Record<Exclude<Actor, 'main'>, string> = {
  coder: 'a1',
  scout: 'scout-1',
  researcher: 'researcher-1',
  reviewer: 'reviewer-1',
  'design-critic': 'design-critic-1',
  'qa-runner': 'qa-runner-1',
}

const DELEGATE = /delegate/i
const DELEGATE_AGENT = /^(?=[^]*delegate)(?=[^]*agent)/i
const OWNER = /Only the owner merges into main\./
const OWNER_OR_DELEGATE = /Only the owner merges into main\.|delegate/i
const READ_ONLY = /read-only/i
const READ_ONLY_REPORT = /^(?=[^]*read-only)(?=[^]*report)/i
const ANY = /\S/

const READ_ONLY_ROLES = ['scout', 'researcher', 'reviewer', 'design-critic', 'qa-runner'] as const
const BOTH = ['main', 'coder'] as const

const lines = (...parts: string[]) => parts.join('\n')

const each = (
  actors: readonly Actor[],
  tool: Tool,
  inputs: readonly string[],
  expected: Expected,
  world?: World,
): Row[] => actors.flatMap(actor => inputs.map((input): Row => [actor, tool, input, expected, world]))

const install = (on: On) => {
  const state: { world: World; calls: Call[] } = { world: {}, calls: [] }

  on('env.get', (_, e) => ({
    value: e.name === 'HOME' ? HOME : e.name === 'TMPDIR' ? (state.world.tmpdir ?? TMPDIR) : undefined,
  }))
  on('tool.call', () => ({ result: {} }))
  on('agent.list', () => {
    if (state.world.listFails) throw new Error('agent list failed')

    return {
      value: Object.entries(AGENT_IDS).map(([role, id]) => ({
        id,
        type: `studio-201:${role}`,
        description: role,
        status: 'running' as const,
        kind: 'local_agent' as const,
        taskStatus: 'running' as const,
        label: role,
        startTime: 0,
        cwd: state.world.agentCwd ?? '/repo',
        tokenCount: 0,
        tokenSamples: [],
        hasRow: true,
      })),
    }
  })
  on('process.run', (_, e) => {
    state.calls.push({ argv: e.argv, init: e.init })
    const { world } = state
    const [bin, ...rest] = e.argv

    if (bin === 'git') {
      if (world.gitFails) throw new Error('git failed')

      const dash = rest.indexOf('-C')
      const cwd = e.init?.cwd ?? (dash === -1 ? undefined : rest[dash + 1])
      const branch = (cwd === undefined ? undefined : world.branches?.[cwd]) ?? world.branch ?? DEFAULT_BRANCH

      return { value: { ...PROCESS_OK, stdout: `${branch}\n` } }
    }

    if (bin === 'gh' && rest[0] === 'pr' && rest[1] === 'view') {
      if (world.ghFails) throw new Error('gh failed')
      if (world.ghStdout !== undefined) return { value: { ...PROCESS_OK, stdout: world.ghStdout } }

      const number = rest.find(arg => /^\d+$/.test(arg)) ?? ''
      const flag = rest.findIndex(arg => arg === '-R' || arg === '--repo')
      const repo = flag === -1 ? undefined : rest[flag + 1]
      const baseRefName = world.bases?.[`${repo}#${number}`] ?? world.bases?.[number]

      return { value: { ...PROCESS_OK, stdout: JSON.stringify({ baseRefName }) } }
    }

    return { value: { ...PROCESS_OK, exitCode: 127, stdout: '' } }
  })

  return state
}

const callOf = (actor: Actor, tool: Tool, input: string): ToolCallArgs & AgentLoop => {
  const loop = actor === 'main' ? {} : { agentId: AGENT_IDS[actor] }

  switch (tool) {
    case 'Bash':
      return { tool, command: input, ...loop }
    case 'Monitor':
      return { tool, description: 'watch', timeout_ms: 60000, command: input, ...loop }
    case 'Write':
      return { tool, file_path: input, content: 'x', ...loop }
    case 'Edit':
      return { tool, file_path: input, old_string: 'a', new_string: 'b', ...loop }
    case 'NotebookEdit':
      return { tool, notebook_path: input, new_source: 'x', ...loop }
  }
}

const reasonOf = (result: ToolCallResult) =>
  result.deny ?? (result.isError === true ? result.text : undefined)

const verdictProblem = (result: ToolCallResult, expected: Expected): string | undefined => {
  const reason = reasonOf(result)

  if (expected === 'allow') return reason === undefined ? undefined : `expected allow, refused: ${reason}`
  if (reason === undefined) return `expected a refusal matching ${expected}, was allowed`
  if (!expected.test(reason)) return `refusal "${reason}" does not match ${expected}`
  if (reason.length > 160) return `refusal is ${reason.length} characters, over 160`

  return undefined
}

const table =
  (rows: readonly Row[]) =>
  async ($: Engine, on: On) => {
    const state = install(on)
    const failures: string[] = []

    for (const [actor, tool, input, expected, world] of rows) {
      state.world = world ?? {}
      state.calls = []

      try {
        const result = await $.tool.call(callOf(actor, tool, input))
        const problem = verdictProblem(result, expected)

        if (problem !== undefined) failures.push(`[${actor}] ${tool} ${input.replaceAll('\n', ' / ')}: ${problem}`)
      } catch (error) {
        failures.push(`[${actor}] ${tool} ${input.replaceAll('\n', ' / ')}: threw ${String(error)}`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${rows.length} rows failed:\n${failures.join('\n')}`)
    }
  }

const FILE_WRITES = [
  'echo x > src/a.ts',
  "sed -i 's/a/b/' src/a.ts",
  'echo x | tee src/a.ts',
  'cp a b',
  'mv a b',
  'rm a',
  'touch a',
]

const PROJECT_ITEM_EDIT = lines(
  `J=$(gh api graphql -f query='{user(login:"x"){projectV2(number:8){id}}}')`,
  `opt(){ echo "$J" | jq -r --arg f "$1" '.a'; }`,
  `for n in 19 22; do gh project item-edit --project-id P --id $(opt a) --field-id F --single-select-option-id O >/dev/null; echo "#$n"; done`,
)
const COMMIT_AND_PUSH = lines(
  `cd /Users/me/repo && git add -A && git -c commit.gpgsign=false commit -q -F - <<'EOF'`,
  'Add thing',
  '',
  '- rm the old > path and git push origin main notes',
  'EOF',
  'git push -q && git log --oneline -2',
)
const ISSUE_CREATE = `gh issue create -R o/r -t "C15 Only I merge" -b "An agent tries gh pr merge on a PR into main; git push origin main is refused." | sed 's#.*/##'`
const PR_DIFF = String.raw`gh pr diff 25 -R o/r | grep -E '^\+.*(a|b)' | cut -c1-160`
const RULESET = lines(`gh api -X POST repos/o/r/rulesets --input - <<'EOF'`, '{"name":"x"}', 'EOF')
const ON_FEATURE: World = { branch: 'feature/x', branches: { '/Users/me/repo': 'feature/x' } }

const MAIN_PR5: World = { bases: { '5': 'main' } }
const MAIN_PR12: World = { bases: { '12': 'main' } }
const FEATURE_PR12: World = { bases: { '12': 'feature/x' } }
const FEATURE_PR5: World = { bases: { '5': 'feature/x' } }
const ON_MAIN: World = { branch: 'main' }
const WORKTREES: World = {
  branch: 'main',
  branches: { '/work/issue-x': 'issue/x', '/work/main-tree': 'main' },
}

const WRAPPED_PUSHES = [
    'time git push origin main',
    'env git push origin main',
    'command git push origin main',
    'nohup git push origin main',
    'exec git push origin main',
    'sudo git push origin main',
    'echo main | xargs git push origin',
    '\\git push origin main',
    '/usr/bin/git push origin main',
    "sh -c 'git push origin main'",
    'bash -c "git push origin main"',
    "zsh -c 'git push origin main'",
    "bash -lc 'git push origin main'",
    'sh -lc "git push origin main"',
    'eval "git push origin main"',
    "sh -c 'gh pr merge 5'",
    'time gh pr merge 5',
    '(git push origin main)',
    '{ git push origin main; }',
    'if true; then git push origin main; fi',
    'sleep 1 & git push origin main',
    'FOO=1 git push origin main',
]

test('C14 main session Edit, Write and NotebookEdit', table([
  ['main', 'Edit', 'src/app.ts', DELEGATE_AGENT],
  ['main', 'Write', 'src/new-file.ts', DELEGATE],
  ['main', 'NotebookEdit', '/repo/analysis.ipynb', DELEGATE],
  ['main', 'Write', '~/.claude/settings.json', DELEGATE],
  ['coder', 'Edit', 'src/app.ts', 'allow'],
  ['coder', 'Write', 'src/new-file.ts', 'allow'],
  ['main', 'Write', '~/.claude/projects/x/memory/note.md', 'allow'],
  ['main', 'Write', '~/.claude/plans/p.md', 'allow'],
  ['main', 'Write', `${HOME}/.claude/projects/x/memory/note.md`, 'allow'],
]))

test('C14 main session shell allowlist refuses', table([
  ...each(['main'], 'Bash', [
    "sed -i 's/a/b/' src/app.ts",
    'echo x > src/app.ts',
    'echo x | tee src/app.ts',
    'cp a b',
    'mv a b',
    'rm a',
    'touch a',
    'ln -s a b',
    'dd if=a of=b',
    'install a b',
    'patch -p1 -i x.patch',
    'git apply x.patch',
    'sh -c "echo x > f"',
    'bash -c "echo x > f"',
    'python -c "print(1)"',
    'node -e "console.log(1)"',
    'python script.py',
    'python3 -c "print(1)"',
    'node script.js',
    "perl -e 'print 1'",
    "perl -pi -e 's/a/b/' f",
    'ruby x.rb',
    'npx prettier --write src',
    'npm install',
    'pnpm exec vitest',
    './scripts/build.sh',
    "awk '{print}' f",
    'curl -o f.txt http://x',
    'truncate -s 0 f',
    'chmod +x f',
    'git checkout feature/x',
    'git checkout -- f.ts',
    'git restore f',
    'git reset --hard',
    'git clean -fd',
    'git rm foo.ts',
    'git mv a b',
    'git stash',
    'find . -name x -delete',
    String.raw`find . -exec rm {} \;`,
    String.raw`find . -ok rm {} \;`,
    'sort -o f f',
    'claude plugin install x',
    "sed --in-place 's/a/b/' f",
    "sed -E -i 's/a/b/' f",
    "sed -i.bak 's/a/b/' f",
    "sed -ni 'p' f",
    'mkdir src/x',
    'rm -rf src',
    'rm foo',
    'cp /tmp/a src/a.ts',
    'echo hi >out.txt',
    'echo hi >| out.txt',
    'echo hi &> out.txt',
    'echo hi 3> out.txt',
    lines('cat <<EOF > f.txt', 'hi', 'EOF'),
    'echo a=>b',
    'echo hi >> src/a.ts',
    'ls > src/list.txt',
    'echo $(rm foo)',
    'echo `rm foo`',
    'ls; python x.py',
    'ls && rm foo',
    'ls | python3',
    'ls & rm foo',
    '(rm foo)',
    '{ rm foo; }',
    'if true; then rm foo; fi',
    'for f in a; do rm $f; done',
    'while true; do python x.py; done',
    'f(){ rm foo; }; f',
    'X=$(python x.py)',
    'echo "$(python x.py)"',
    lines('cat <<EOF', '$(rm foo)', 'EOF'),
  ], DELEGATE),
]))

test('C14 main session shell allowlist allows', table([
  ...each(['main'], 'Bash', [
    'git status',
    'ls',
    'gh issue list',
    'ls -la src',
    'cat src/app.ts | head -5',
    'grep -rn x src | sort | uniq -c',
    'find . -name "*.ts" | wc -l',
    'jq -r .a file.json',
    'diff a b',
    'git log --oneline -5',
    'git diff --stat',
    'git show HEAD',
    'git rev-parse --abbrev-ref HEAD',
    'git ls-files',
    'git fetch origin',
    'git remote -v',
    'git branch -a',
    'git tag',
    'git add -A',
    'git worktree add ../w issue/x',
    'git commit -m x',
    'git switch -c issue/x',
    'git merge --no-ff x',
    'git config user.name',
    'git blame src/a.ts',
    'git grep foo',
    'git describe',
    'git shortlog -sn',
    'gh pr view 1',
    'claude plugin validate .',
    'claude plugin test .',
    'claude plugin list',
    'pwd',
    'date',
    'which node',
    'basename a/b',
    'dirname a/b',
    'realpath .',
    'echo hi',
    'printf "%s" x',
    'test -f a',
    '[ -f a ]',
    'true',
    'false',
    'sleep 1',
    'cd /tmp',
    'tree src',
    'stat f',
    'du -sh .',
    'file f',
    'cmp a b',
    'cut -c1-5 f',
    'tr a b',
    'sort f',
    'wc -l f',
    'head f',
    'tail f',
    'rg x',
    "sed -n '1,5p' f",
    'ls foo 2>/dev/null',
    'ls foo 2>&1 | head',
    'echo hi > /dev/null',
    'echo hi > /dev/stderr',
    'echo hi > /dev/stdout',
    'echo "$(git rev-parse HEAD)"',
    'echo `git status`',
    'git status; git log -1',
    'git status && git log -1',
    'git status || echo none',
    'git status | head',
    'sleep 1 &',
    '(cd /tmp && ls)',
    '{ ls; echo x; }',
    'if true; then ls; fi',
    'for f in a b; do echo $f; done',
    'f(){ ls; }; f',
    'X=1; echo $X',
    'X=$(date)',
    'time git status',
    'env FOO=1 git status',
    '/usr/bin/git status',
    '\\git status',
    lines("cat <<'EOF'", '$(rm foo)', 'EOF'),
  ], 'allow'),
  ...each(['coder'], 'Bash', [
    'python -c "print(1)"',
    'node -e "console.log(1)"',
    'sh -c "echo x > f"',
  ], 'allow'),
]))

test('C14 main session temp dirs', table([
  ['main', 'Write', `${TMPDIR}scratch/plan.html`, 'allow'],
  ['main', 'Write', '/private/tmp/claude-501/scratch/design.html', 'allow'],
  ['main', 'Write', '/tmp/plan.html', 'allow'],
  ['main', 'Write', '/var/folders/ab/xyz/T/scratch/plan.html', 'allow', { tmpdir: '/var/folders/ab/xyz/T' }],
  ['main', 'Write', '/private/var/folders/ab/xyz/T/plan.html', 'allow'],
  ['main', 'Write', '/var/folders/ab/xyz/T/plan.html', 'allow', { tmpdir: '/private/var/folders/ab/xyz/T/' }],
  ['main', 'Edit', '/tmp/plan.html', 'allow'],
  ['main', 'Bash', 'echo x > /tmp/plan.html', 'allow'],
  ['main', 'Bash', `echo x > ${TMPDIR}scratch/design.html`, 'allow'],
  ['main', 'Bash', 'echo x >> /private/tmp/claude-501/scratch/notes.md', 'allow'],
  ['main', 'Bash', 'echo x > /private/var/folders/ab/xyz/T/design.html', 'allow'],
  ['main', 'Bash', lines("cat <<'EOF' > /tmp/plan.html", '<html></html>', 'EOF'), 'allow'],
  ['main', 'Bash', 'rm -rf /var/folders/ab/xyz/T/foo', 'allow'],
  ['main', 'Bash', 'rm /tmp/foo', 'allow'],
  ['main', 'Bash', 'cp src/app.ts /tmp/app.ts', 'allow'],
  ['main', 'Bash', 'mkdir -p /tmp/x', 'allow'],
  ['main', 'Bash', 'mkdir -p /private/tmp/claude-501/scratch', 'allow'],
  ['main', 'Write', '/tmp/../Users/me/repo/src/a.ts', DELEGATE],
  ['main', 'Write', '/tmpfiles/a.ts', DELEGATE],
  ['main', 'Write', '/private/var/folders/other/T/x.html', DELEGATE],
  ['main', 'Write', '/var/folders/ab/xyz/T/../../x', DELEGATE],
  ['main', 'Bash', 'rm /tmp/../Users/me/x', DELEGATE],
  ['main', 'Bash', 'echo x > /tmp/a.txt && echo y > src/app.ts', DELEGATE],
]))

test('C14 real orchestrator commands', table([
  ['main', 'Bash', PROJECT_ITEM_EDIT, 'allow'],
  ['main', 'Bash', COMMIT_AND_PUSH, 'allow', ON_FEATURE],
  ['main', 'Bash', ISSUE_CREATE, 'allow', MAIN_PR5],
  ['main', 'Bash', 'gh pr merge 30 -R o/r --squash --delete-branch 2>&1 | tail -1', 'allow', { bases: { 'o/r#30': 'feature/team-policy' } }],
  ['main', 'Bash', PR_DIFF, 'allow'],
  ['main', 'Bash', 'git push -q origin origin/main:refs/heads/release/v0.1', 'allow'],
  ['main', 'Bash', RULESET, 'allow'],
  ['main', 'Write', '/private/var/folders/ab/xyz/T/plan.html', 'allow'],
]))

test('C15 git push', table([
  ...each(BOTH, 'Bash', [
    'git push origin main',
    'git push origin HEAD:main',
    'git push --all',
    'git push --mirror origin',
    'git push origin --delete main',
    'git push --force origin main',
    'git push -f origin main',
    'git push -o ci.skip origin main',
    'git push origin :main',
    'git push origin feature/x:main',
    'git push origin issue/x main',
    'git push origin "main"',
    'git push origin HEAD:refs/heads/main',
    'git push origin refs/heads/main',
    'git push upstream main',
    'git push git@github.com:o/r.git main',
    'git push --set-upstream origin main',
    'git push --porcelain origin main',
    'git push origin +main',
    'git push origin +feature/x:main',
    "git push origin 'refs/heads/*:refs/heads/*'",
    'git push origin refs/heads/*:refs/heads/*',
    "git push origin '+refs/heads/*:refs/heads/*'",
    'git --no-pager push origin main',
    'git -C /repo push origin main',
    'git -c user.name=x push origin main',
    'GIT_SSH_COMMAND=x git push origin main',
    'git add . && git commit -m x && git push origin main',
  ], OWNER),
  ...each(BOTH, 'Bash', ['git push', 'git push -u origin HEAD', 'git push -u origin', 'git push origin HEAD', 'git push origin'], OWNER, ON_MAIN),
  ...each(BOTH, 'Bash', [
    'git push origin feature/x',
    'git push -u origin issue/20-policy',
    'git push',
    'git push origin',
    'git push origin HEAD',
    'git push -u origin issue/x',
    'git push --force-with-lease origin issue/x',
    'git push --force-with-lease=main origin issue/x',
    'git push origin feature/team-policy',
    'git push origin release/v0.1',
    'git push origin master',
    'git push main',
    'git push --tags',
    'git push --prune origin',
    'git push -q origin origin/main:refs/heads/release/v0.1',
  ], 'allow'),
]))

test('C15 gh pr merge', table([
  ...each(BOTH, 'Bash', [
    'gh pr merge 12',
    'gh api -X PUT repos/o/r/pulls/12/merge',
  ], OWNER, MAIN_PR12),
  ...each(BOTH, 'Bash', ['gh pr merge 12'], 'allow', FEATURE_PR12),
  ...each(BOTH, 'Bash', [
    'gh pr merge 5 --squash',
    'gh pr merge --squash --delete-branch 5',
    'gh pr merge 5 --admin',
    'gh pr merge 5 --auto --squash',
    'gh pr merge #5',
    'gh pr merge https://github.com/o/r/pull/5',
    'echo y | gh pr merge 5',
    'gh pr merge 5 --squash && echo done',
    'gh pr edit 5 --base main && gh pr merge 5',
    'gh pr edit 5 -B main; gh pr merge 5',
  ], OWNER, MAIN_PR5),
  ...each(BOTH, 'Bash', [
    'gh pr edit 5 --base main && gh pr merge 5',
    'gh pr edit 5 -B main; gh pr merge 5',
  ], OWNER, FEATURE_PR5),
  ...each(BOTH, 'Bash', ['gh pr merge 5 --squash'], 'allow', { bases: { '5': 'release/v0.1' } }),
  ...each(BOTH, 'Bash', [
    'gh pr merge 5 -R other/repo',
    'gh pr merge 5 --repo other/repo',
  ], OWNER, { bases: { '5': 'feature/x', 'other/repo#5': 'main' } }),
  ...each(BOTH, 'Bash', ['gh pr merge 5 -R other/repo'], 'allow', { bases: { '5': 'main', 'other/repo#5': 'feature/x' } }),
  ...each(BOTH, 'Bash', [
    'gh pr merge -R o/r 5',
    'gh -R o/r pr merge 5',
    'gh --repo o/r pr merge 5',
  ], OWNER, { bases: { 'o/r#5': 'main', '5': 'feature/x' } }),
  ...each(BOTH, 'Bash', ['gh pr merge -R o/r 5'], 'allow', { bases: { 'o/r#5': 'feature/x', '5': 'main' } }),
]))

test('C15 gh api and graphql', table([
  ...each(BOTH, 'Bash', [
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
    String.raw`gh api graphql -f query="mutation { mergePullRequest(input:{pullRequestId:\"x\"}) { clientMutationId } }"`,
    String.raw`gh api graphql -f query="mutation { enablePullRequestAutoMerge(input:{pullRequestId:\"x\"}) { clientMutationId } }"`,
    'gh api graphql -F query=@q.graphql',
    'gh api graphql --input q.json',
    'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc -F force=true',
    'gh api -X POST repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api -X PUT repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api -X POST repos/o/r/merges -f base=main -f head=issue/x',
    'gh api -X PUT repos/o/r/contents/f.txt -f message=m -f content=Yg== -f branch=main',
  ], OWNER),
  ...each(BOTH, 'Bash', [
    'gh api -XPUT repos/o/r/pulls/5/merge',
    'gh api --method PUT repos/o/r/pulls/5/merge',
    'gh api --method=PUT repos/o/r/pulls/5/merge',
    'gh api -X PUT /repos/o/r/pulls/5/merge',
    'gh api -X PUT repos/{owner}/{repo}/pulls/5/merge',
    'gh api repos/o/r/pulls/5/merge -f merge_method=squash -X PUT',
    'gh api -X PUT "repos/o/r/pulls/5/merge?x=1"',
    'gh api -X PUT repos/o/r/pulls/5/merge/',
    'gh api -X PUT repos/o/r/pulls/5/merge --input body.json',
  ], OWNER, MAIN_PR5),
  ...each(BOTH, 'Bash', [
    "gh api graphql -f query='query { viewer { login } }'",
    'gh api repos/o/r/pulls/5',
    'gh api -X POST repos/o/r/merges -f base=feature/x -f head=issue/x',
    'gh api -X PUT repos/o/r/contents/f.txt -f message=m -f content=Yg== -f branch=issue/x',
    'gh api -X PATCH repos/o/r/git/refs/heads/issue/x -f sha=abc',
    'gh api -X PUT repos/o/r/pulls/5/merge',
    'gh api -X PUT "repos/o/r/pulls/5/merge?x=1"',
    'gh api -X PUT repos/o/r/pulls/5/merge/',
  ], 'allow', FEATURE_PR5),
]))

test('C15 Monitor tool', table([
  ['main', 'Monitor', 'git push origin main', OWNER],
  ['coder', 'Monitor', 'git push origin main', OWNER],
  ['main', 'Monitor', 'gh pr merge 5', OWNER, MAIN_PR5],
  ['coder', 'Monitor', 'gh pr merge 5', OWNER, MAIN_PR5],
  ['main', 'Monitor', 'python x.py', DELEGATE],
  ['main', 'Monitor', 'echo x > src/a.ts', DELEGATE],
  ['reviewer', 'Monitor', 'rm foo', READ_ONLY],
  ['main', 'Monitor', 'git log --oneline', 'allow'],
  ['coder', 'Monitor', 'git log --oneline', 'allow'],
  ['coder', 'Monitor', 'gh pr merge 5', 'allow', FEATURE_PR5],
]))

test('C15 wrappers and paths are seen through', table([
  ...each(['coder'], 'Bash', WRAPPED_PUSHES, OWNER, MAIN_PR5),
  ...each(['main'], 'Bash', WRAPPED_PUSHES, OWNER_OR_DELEGATE, MAIN_PR5),
]))

test('C15 current branch is read in the agent cwd', table([
  ['coder', 'Bash', 'git push', 'allow', { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'git push', OWNER, { branch: 'issue/x', branches: { '/work/main-tree': 'main' }, agentCwd: '/work/main-tree' }],
  ['main', 'Bash', 'git -C /work/main-tree push', OWNER, { ...WORKTREES, branch: 'issue/x' }],
  ['main', 'Bash', 'cd /work/main-tree && git push', OWNER, { ...WORKTREES, branch: 'issue/x' }],
  ['main', 'Bash', 'git -C /work/issue-x push', 'allow', WORKTREES],
  ['main', 'Bash', 'cd /work/issue-x && git push', 'allow', WORKTREES],
  ['coder', 'Bash', 'git -C /work/main-tree push', OWNER, { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'cd /work/main-tree && git push', OWNER, { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'git -C /work/issue-x push', 'allow', { ...WORKTREES, agentCwd: '/work/main-tree' }],
]))

test('D32 read-only roles cannot write through Bash', table([
  ...READ_ONLY_ROLES.flatMap(role => each([role], 'Bash', FILE_WRITES, READ_ONLY_REPORT)),
  ...READ_ONLY_ROLES.flatMap(role => each([role], 'Bash', ['git status', 'claude plugin test .', 'gh pr view 1'], 'allow')),
  ...each(['coder'], 'Bash', FILE_WRITES, 'allow'),
  ...each(['reviewer', 'scout'], 'Bash', [
    'env rm foo',
    '/bin/rm foo',
    '\\rm foo',
    'command rm foo',
    'sudo rm foo',
    'time rm foo',
    'nohup rm foo',
    "sh -c 'rm foo'",
    'bash -lc "echo x > src/a.ts"',
    'eval "rm foo"',
    'ls | xargs rm',
    'find . -delete',
    String.raw`find . -exec rm {} \;`,
    'sort -o f f',
    'truncate -s 0 f',
    "awk -i inplace '{print}' f",
    "perl -pi -e 's/a/b/' f",
    "sed -ni 'p' f",
    "sed -E -i 's/a/b/' f",
    "sed --in-place 's/a/b/' f",
    "sed -i.bak 's/a/b/' f",
    'echo hi >| out.txt',
    'echo hi &> out.txt',
    'echo hi 3> out.txt',
    'echo hi >out.txt',
    lines('cat <<EOF > f.txt', 'hi', 'EOF'),
    'python3 -c "print(1)"',
    'node -e "1"',
    "perl -e 'print 1'",
    lines('python3 - <<EOF', 'open("x","w").write("a")', 'EOF'),
    'ruby -e 1',
    "echo 'print(1)' | python3",
    'curl -o f.txt http://x',
    'tar -xf a.tar',
    'tar xf a.tar',
    'unzip a.zip',
    'mkdir x',
    'mkdir -p src/x',
  ], READ_ONLY),
  ...each(['reviewer', 'scout'], 'Bash', [
    'git apply --check x.patch',
    'patch --dry-run -p1 -i x.patch',
    'ls > /tmp/out.txt',
    `echo hi > ${TMPDIR}out.txt`,
    'echo hi > /dev/null',
    'ls 2>&1',
  ], 'allow'),
]))

test('D32 qa-runner may write only under qa/', table([
  ['qa-runner', 'Bash', 'some-cmd > qa/v0.1/C4.txt', 'allow'],
  ['qa-runner', 'Bash', 'some-cmd > /repo/qa/v0.1/C4.txt', 'allow'],
  ['qa-runner', 'Bash', 'some-cmd | tee qa/v0.1/C4.txt', 'allow'],
  ['qa-runner', 'Bash', 'cp a.png qa/v0.1/', 'allow'],
  ['qa-runner', 'Bash', 'cp /tmp/x.png qa/v0.1/C4.png', 'allow'],
  ['qa-runner', 'Bash', 'some-cmd > src/a.ts', READ_ONLY],
  ['qa-runner', 'Bash', 'cp a src/b', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x | tee src/x', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x > /repo/src/a.ts', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x > qa/../src/a.ts', READ_ONLY],
  ['scout', 'Bash', 'some-cmd > qa/v0.1/C4.txt', READ_ONLY],
  ['researcher', 'Bash', 'some-cmd > qa/v0.1/C4.txt', READ_ONLY],
  ['reviewer', 'Bash', 'some-cmd > qa/v0.1/C4.txt', READ_ONLY],
  ['design-critic', 'Bash', 'some-cmd > qa/v0.1/C4.txt', READ_ONLY],
]))

test('quoted text and heredoc bodies never count as commands', table([
  ...each(BOTH, 'Bash', [
    'git commit -m "docs: gh pr merge 5"',
    'git commit -m "use > in text"',
    "git commit -m 'a > b'",
    'git commit -m "fix tee bug"',
    'git commit -m "no git apply here"',
    'gh issue create -t t -b "a > b"',
    'gh issue create -b "run git push origin main"',
    'gh issue create -b "a; gh pr merge 5"',
    'gh pr create --base feature/x --title t --body "a > b"',
    'gh pr create -b "x && y | z"',
    'gh issue create --body "x\ngh pr merge 5\ny"',
    'git commit -m "$(cat <<EOF\nfoo > bar\nEOF\n)"',
    lines("gh pr create --body-file - <<'EOF'", 'Use git push origin main', 'EOF'),
    lines("gh issue create --body-file - <<'EOF'", 'rm foo', 'cp a b', 'EOF'),
    lines("gh issue create --body-file - <<'EOF'", 'Refusal case:', 'git push origin main', 'EOF'),
    lines("git commit -F - <<'EOF'", 'tee is a thing', 'EOF'),
    lines("git commit -F - <<'EOF'", 'sed -i x', 'EOF'),
    lines("git commit -F - <<'EOF'", 'msg > x', 'EOF'),
    lines("git commit -F - <<'EOF'", 'foo > bar', 'EOF'),
    lines("git commit -F - <<'EOF'", 'fix', '', 'gh pr merge 5 is refused', 'EOF'),
    lines('cat <<EOF', 'hello > world', 'EOF'),
  ], 'allow', MAIN_PR5),
  ...each(['main', 'coder', 'reviewer'], 'Bash', [
    'echo "cp is a command"',
    'echo "git push origin main"',
    'grep -rn "gh pr merge" docs',
    'grep -rn "=>" src',
    'cat src/policy.ts | grep "=>"',
    'git log --format="%an <%ae>"',
    'ls committee',
    'git log --grep=tee',
    'ls ./cp',
  ], 'allow', MAIN_PR5),
]))

test('lookup errors fail closed', table([
  ['main', 'Bash', 'gh pr merge 5', ANY, { ghFails: true }],
  ['coder', 'Bash', 'gh pr merge 5', ANY, { ghFails: true }],
  ['coder', 'Bash', 'gh pr merge 5', ANY, { bases: {} }],
  ['coder', 'Bash', 'gh pr merge 5', ANY, { ghStdout: 'not json' }],
  ['coder', 'Bash', 'gh pr merge 5', ANY, { ghStdout: '' }],
  ['main', 'Bash', 'git push', ANY, { gitFails: true }],
  ['coder', 'Bash', 'git push', ANY, { gitFails: true }],
  ['coder', 'Bash', 'echo x > src/a.ts', ANY, { listFails: true }],
  ['reviewer', 'Bash', 'echo x > src/a.ts', ANY, { listFails: true }],
  ['main', 'Bash', 'git status', 'allow', { ghFails: true, gitFails: true, listFails: true }],
  ['coder', 'Bash', 'git status', 'allow', { ghFails: true, gitFails: true, listFails: true }],
  ['main', 'Bash', 'git push origin feature/x', 'allow', { gitFails: true }],
  ['coder', 'Bash', 'git push origin feature/x', 'allow', { gitFails: true }],
  ['coder', 'Bash', 'git push origin main', OWNER, { gitFails: true, ghFails: true, listFails: true }],
]))

test('every lookup the policy runs has a 10 s timeout', async ($, on) => {
  const state = install(on)

  state.world = MAIN_PR12
  await $.tool.call(callOf('main', 'Bash', 'gh pr merge 12'))
  state.world = ON_MAIN
  await $.tool.call(callOf('coder', 'Bash', 'git push'))

  expect(state.calls.length).toBeGreaterThan(1)
  for (const call of state.calls) {
    expect(call.init?.timeoutMs, call.argv.join(' ')).toBe(10000)
  }
})

test('the policy module exports only registerPolicy', () => {
  expect(Object.keys(policy)).toEqual(['registerPolicy'])
})

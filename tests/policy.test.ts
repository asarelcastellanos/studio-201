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
// Seam: when a merge's PR can't be resolved, the refusal says so (matches /resolve|determine|identify|which/i) and does not say 'Only the owner'.
// Seam: $TMPDIR and $HOME in a command resolve from $.env.get; any other variable in a path, a gh target or a refspec is unresolved and refused.

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
const UNRESOLVED = /^(?![^]*Only the owner)(?=[^]*(?:resolve|determine|identify|which))/i

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
const MAIN_PR6: World = { bases: { '6': 'main' } }
const FEATURE_PR6: World = { bases: { '6': 'feature/x' } }
const NO_BASES: World = { bases: {} }
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
    'caffeinate git push origin main',
    'arch -arm64 git push origin main',
    'stdbuf -o0 git push origin main',
    String.raw`find . -maxdepth 0 -exec git push origin main \;`,
    'watch -n1 git push origin main',
    "env -S 'git push origin main'",
    'env -i git push origin main',
    'env FOO=1 -i git push origin main',
    'time -p git push origin main',
    'command -p git push origin main',
    'nice -n 5 git push origin main',
    'nohup git push origin main &',
    'timeout 30 git push origin main',
    'timeout -s KILL 30 git push origin main',
    'sudo -u x git push origin main',
    "bash -ec 'git push origin main'",
    "bash --login -c 'git push origin main'",
    lines("sh <<'EOF'", 'git push origin main', 'EOF'),
    "echo 'git push origin main' | sh",
    "eval 'git push origin main'",
    'git push origin main;',
    '"git" push origin main',
    'g\\it push origin main',
    'git\\\n push origin main',
    'caffeinate gh pr merge 5',
    'arch -arm64 gh pr merge 5',
    String.raw`find . -maxdepth 0 -exec gh pr merge 5 \;`,
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
  ...each(['main'], 'Bash', [
    'echo $(( $(rm -r src) + 1 ))',
    '(( x = $(rm -r src) ))',
    'echo $[ $(rm -r src) + 1 ]',
    'echo `echo \\`rm -r src\\``',
    'echo ${x:-`rm -r src`}',
    'case a in $(rm -r src)) : ;; esac',
    lines('case a in', '  b) rm -r src ;;', 'esac'),
    'a[$(rm -r src)]=1',
    'echo <(rm -r src)',
    'cat <<< "$(rm -r src)"',
    lines('cat <<EOF', '\\$(rm -r src) `rm -r src`', 'EOF'),
    lines('cat <<"EOF"', 'x', 'EOF', 'rm -r src'),
    lines('cat <<EOF >/dev/null', 'x', 'EOF', 'rm -r src'),
    lines('cat <<-EOF', '\tx', '\tEOF', 'rm -r src'),
    'eval "rm -r src"',
    'eval rm -r src',
    "bash -c 'rm -r src'",
    'sh -c "echo $(rm -r src)"',
    "env -S 'rm -r src'",
    'exec rm -r src',
    'command rm -r src',
    '\\rm -r src',
    '/bin/rm -r src',
    "'rm' -r src",
    'r""m -r src',
    "$'rm' -r src",
    'rm -r /tmp/../Users/x',
    'rm -r /tmp/x /Users/x',
    'rm -r /tmp',
    'rm -r /tmp/',
    'rm -r /tmp/*',
    'rm -rf $TMPDIR',
    'rm -rf "$TMPDIR"',
    'rm -rf /var/folders/ab/xyz/T/',
    'cp -t src /tmp/a',
    'cp -r /tmp/a /tmp/b src',
    'mkdir -p /tmp/a src/b',
    'touch src/x',
    'chmod +x src/x',
    'chmod -R +x /tmp/x src',
    'rm -r -- src',
    'rm -r /tmp/x -- src',
    'mv -t /tmp/x /tmp/a src/b',
    'mv -t src /tmp/a',
    'echo x > /tmp/../src/a',
    'echo x > /var/folders/ab/xyz/T/../../a',
    'echo x > /dev/tty',
    'echo x >& src/a',
    'echo x &> src/a',
    'echo x >| src/a',
    'exec > src/a',
    'exec 3> src/a',
    'echo x 3>src/a',
    'echo x 1>src/a',
    'echo x >src/a',
    '{ echo x; } > src/a',
    '(echo x) > src/a',
    'if true; then echo x; fi > src/a',
    'for i in 1; do echo x; done > src/a',
    'while false; do :; done > src/a',
    'f() { echo x; } > src/a; f',
    'echo x | dd of=src/a',
    'cat /dev/null | sh',
    'echo rm | sh',
    "printf 'rm -r src' | bash",
    "node -e 'x'",
    "python3 -c 'x'",
    lines("cat > /tmp/s.sh <<'EOF'", 'rm -r src', 'EOF', 'bash /tmp/s.sh'),
    'source /tmp/s.sh',
    '. /tmp/s.sh',
    '/tmp/s.sh',
    "claude -p 'do stuff'",
    "sed -n 'w src/a.ts' README.md",
    "sed -n 'W src/a.ts' README.md",
    "sed 's/a/b/w src/a.ts' README.md",
    "sed 's/a/b/e' README.md",
    "sed -e 'w src/a.ts' README.md",
    'sed --in-place s/a/b/ README.md',
    'sed -s -i.bak s/a/b/ README.md',
    'git diff --output=src/a.ts',
    'git log --output=src/a.ts',
    'sort --output=src/a src/b',
    "git config alias.x '!rm -r src'",
    "git config core.fsmonitor 'sh -c evil'",
    'git config user.name',
    'git config user.name x',
    'git config --global user.name x',
    'git config --unset user.name',
    "git -c core.fsmonitor='sh -c evil' status",
    "git -c alias.x='!sh -c evil' x",
    "git grep -O'sh -c evil' foo",
    "mkdir -p /tmp/h; printf '#!/bin/sh\\nrm -r src\\n' > /tmp/h/pre-commit; chmod +x /tmp/h/pre-commit; git -c core.hooksPath=/tmp/h commit -m x",
    'rg --pre ./x foo',
    'rg --pre=/tmp/x foo .',
    'find . -name x -fprint src/a',
    'tree -o src/a',
    "awk '{print > \"src/a\"}' README.md",
    "awk 'BEGIN{system(\"rm x\")}'",
    'git rebase main',
    'git checkout issue/x',
    'git reset --hard HEAD~1',
    "gh alias set --shell x 'rm -r src'",
    "gh alias set pm 'pr merge'; gh pm 5 --squash",
    'gh extension install o/r',
    'gh run download 5',
    'gh release download v1',
    'gh pr checkout 6',
    'gh repo clone o/r',
  ], DELEGATE),
  ...each(['main'], 'Bash', [
    '(cd /tmp); rm -r src',
    '(cd /tmp) && rm -r src',
    'cd /tmp | cat; rm -r src',
    'if false; then cd /tmp; fi; rm -r src',
    'echo $(cd /tmp); rm -r src',
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
    'git config --get user.name',
    'git config --list',
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
  ...each(['main'], 'Bash', [
    '[[ -f a ]]',
    'f(){ local x=1; echo $x; }; f',
    'declare -a xs=(1 2 3); echo "${xs[@]}"',
    'set -e',
    'arr=(a b c); echo "${arr[0]}"',
    "awk '{print $1}' /tmp/f",
    "awk -F: '{print $1}' x",
    'mktemp -d',
    'd=$(mktemp -d); echo $d',
    'echo x | tee /tmp/s/a',
    'mv /tmp/a /tmp/b',
    'mv -t /tmp/x /tmp/a /tmp/b',
    'cp -t /tmp/x src/a',
    'git worktree remove ../wt',
    'git worktree prune',
    'git pull',
    'git -C /repo worktree add ../wt issue/x',
    'git -C /tmp/x commit -m y',
    'git --no-pager log',
    'gh --version',
    'git switch -c x',
    'git merge issue/x',
    'git worktree add ../wt',
    'git branch -D x',
    'git tag -d v1',
    'git push origin :feature',
    'git ls-remote origin | head',
    'git branch --show-current',
    'git switch issue/x && git merge main',
    'git tag v1 && git push origin v1',
    'git diff main...HEAD --stat',
    'git show HEAD:README.md',
    'git fetch origin && git status -sb',
    'git branch -d old',
    'git diff --name-only | xargs ls',
    'git log --oneline -5 2>&1 | head',
    'grep -rn "foo" src | cut -d: -f1 | sort -u',
    "find . -name '*.ts' -not -path './node_modules/*' | wc -l",
    "find . -name '*.ts' -exec grep -l foo {} +",
    'ls -la | head -5',
    "gh issue list --json number,title | jq -r '.[] | \"\\(.number) \\(.title)\"'",
    "gh api repos/o/r/pulls/6/comments --jq '.[].body'",
    'gh pr view 6 --json baseRefName -q .baseRefName',
    "gh pr list --json number -q '.[].number' | xargs -I{} gh pr view {}",
    "echo 'x' | gh issue comment 3 --body-file -",
    'gh issue comment 3 --body "$(cat /tmp/c.md)"',
    'gh pr create --title t --body-file /tmp/pr.md --base feature/x',
    '[ "$(git branch --show-current)" = main ] && echo on-main',
    'test -z "$(git status --porcelain)" && git push -u origin issue/x',
    "sed 's/a/b/i' f",
    "sed -E 's/(a)/\\1/' x",
    'echo x >/dev/null 2>&1',
    'echo x >&2',
    'cd /tmp && rm foo',
    '(cd /tmp && rm -r src)',
    'echo $(cd /tmp); echo ok',
    'gh run download 5 --dir /tmp/dl',
    'gh release download v1 -D /tmp/dl',
    'gh repo clone o/r /tmp/x',
    'cat $HOME/.claude/plans/p.md',
  ], 'allow'),
  ...each(['main'], 'Bash', ['[ -n "$x" ] && gh pr merge 6 --squash'], OWNER, MAIN_PR6),
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
  ['main', 'Bash', 'echo x > "$TMPDIR/out"', 'allow'],
  ['main', 'Bash', 'echo x > $TMPDIR/out', 'allow'],
  ['main', 'Bash', 'rm -r "$TMPDIR/x"', 'allow'],
  ['main', 'Bash', 'echo x > $HOME/src/a', DELEGATE],
  ['main', 'Bash', 'rm -r $HOME/x', DELEGATE],
  ['main', 'Bash', 'echo x > /private/tmp/a', 'allow'],
  ['main', 'Bash', 'echo x > /var/folders/ab/xyz/T/a', 'allow'],
  ['main', 'Bash', 'echo x > /private/var/folders/ab/xyz/T/a', 'allow'],
  ['main', 'Bash', 'mkdir -p /tmp/s && echo x > /tmp/s/a', 'allow'],
  ['main', 'Bash', 'rm -r /tmp/s', 'allow'],
  ['main', 'Bash', 'echo x | tee /tmp/s/a', 'allow'],
  ['main', 'Bash', 'mv /tmp/a /tmp/b', 'allow'],
  ['main', 'Bash', 'mv -t /tmp/x /tmp/a /tmp/b', 'allow'],
  ['main', 'Bash', 'cp -t /tmp/x src/a', 'allow'],
  ['main', 'Bash', lines("cat > /tmp/p.md <<'EOF'", 'plan', 'EOF'), 'allow'],
  ['main', 'Bash', lines("cat <<'EOF' > /private/tmp/claude-501/x/plan.md", 'plan', 'EOF'), 'allow'],
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
  ...each(BOTH, 'Bash', [
    'git push origin HEAD:heads/main',
    'git push origin issue/x:main',
    'git push --delete origin main',
    'git push --mirror',
    'git push . HEAD:main',
    'git push ssh://x/y.git main',
    'git push origin issue/x:refs/heads/main',
    'git push -o x origin main',
    'git push --push-option=x origin main',
    'git push --repo=origin main',
    'git push --receive-pack=x origin main',
    'git push --exec=x origin main',
    'git push -f -u origin main',
    'git push -fu origin main',
    "git push origin ma''in",
    'git push origin "ma"in',
    "git push origin $'main'",
    'git push origin m{a,}in',
    'git push origin {main,x}',
    'git push origin ?ain',
    'git push origin [m]ain',
    'git push origin mai*',
    'git push origin HEAD^:main',
    'GIT_DIR=x git push origin main',
    'git push origin main 2>&1 | tail -3',
    'git push origin main;',
  ], OWNER),
  ...each(BOTH, 'Bash', ["git -c alias.p='push origin main' p"], OWNER_OR_DELEGATE),
  ...each(BOTH, 'Bash', [
    'git push origin "$BR"',
    'git push origin $(git branch --show-current)',
    'git push origin ma$()in',
  ], ANY),
  ...each(BOTH, 'Bash', ['git push --force origin issue/x'], 'allow'),
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
  ...each(BOTH, 'Bash', [
    'gh pr merge --squash 5',
    'gh pr merge 5 -s',
    'gh pr merge 5 -b "x" -t "y"',
    'gh pr merge "5"',
    'gh pr merge 5 | cat',
    'GH_REPO=o/r gh pr merge 5',
  ], OWNER, MAIN_PR5),
  ...each(BOTH, 'Bash', ['gh pr ready 6 && gh pr merge 6 --auto'], OWNER, MAIN_PR6),
  ...each(BOTH, 'Bash', ['gh pr merge'], OWNER, { bases: { '': 'main' } }),
  ...each(BOTH, 'Bash', ['gh pr merge 5 --squash --repo o/r'], OWNER, { bases: { 'o/r#5': 'main', '5': 'feature/x' } }),
  ...each(BOTH, 'Bash', [
    'gh api -X PATCH repos/o/r/pulls/6 -f base=main && gh pr merge 6 --squash',
    'gh api repos/o/r/pulls/6 -X PATCH -f base=main; gh pr merge 6 --squash',
    'gh pr edit 6 --base main && gh pr merge 6 --squash',
    'gh pr edit 6 -B main; gh pr merge 6',
    'gh pr edit 6 --base=main; gh pr merge 6',
    'gh pr edit 6 -Bmain; gh pr merge 6',
    'gh pr edit 6 --base "$B"; gh pr merge 6',
    'gh pr merge 6 --squash && gh pr edit 6 --base main',
    'gh pr edit 6 --base feature/y && gh pr merge 6',
  ], OWNER, FEATURE_PR6),
  ...each(BOTH, 'Bash', ['gh pr create -B main --fill; gh pr merge --squash'], OWNER, { bases: { '': 'feature/x' } }),
  ...each(BOTH, 'Bash', [
    'gh pr merge "$N" --squash',
    'gh api -X PUT repos/o/r/pulls/$N/merge',
    'gh api -X PUT "repos/o/r/pulls/$N/merge"',
  ], UNRESOLVED, NO_BASES),
  ...each(BOTH, 'Bash', [
    'gh api -X "$M" repos/o/r/pulls/5/merge',
    'gh pr "$S" 6',
    'gh pr create -B main --fill && gh pr merge "$(gh pr view --json number -q .number)"',
    "gh alias set pm 'pr merge'; gh pm 5",
  ], ANY, MAIN_PR5),
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
  ...each(BOTH, 'Bash', [
    'gh api repos/o/r/pulls/5/merge -X PUT',
    'gh api repos/o/r/pulls/5/merge --method PUT',
    'gh api repos/o/r/pulls/5/merge -XPUT',
    'gh api repos/o/r/pulls/5/merge --method=PUT',
    'gh api https://api.github.com/repos/o/r/pulls/5/merge -X PUT',
    'gh api -X put repos/o/r/pulls/5/merge',
    'gh api "repos/o/r/pulls/5/merge" -X PUT',
    'gh api repos/o/r/pulls/5/merge -X PUT --hostname github.com',
    "gh api -H 'X: y' -X PUT repos/o/r/pulls/5/merge",
    'gh api repos/o/r/pulls/5//merge -X PUT',
    'gh api -X PUT repos/o/r/pulls/5/merge#x',
    'gh api -X PUT repos/o/r/pulls/5/merge -f merge_method=squash',
    'gh api repos/o/r/pulls/5/../5/merge -X PUT',
  ], OWNER, MAIN_PR5),
  ...each(BOTH, 'Bash', [
    `gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:"x"}) { clientMutationId } }'`,
    `gh api graphql -f query='mutation { enablePullRequestAutoMerge(input:{pullRequestId:"x"}) { clientMutationId } }'`,
    'gh api graphql -F query=@/tmp/q.graphql',
    'gh api graphql --input /tmp/q.json',
    'gh api repos/o/r/contents/f -X PUT -f branch=main -f message=m -f content=Zg==',
    'gh api repos/o/r/contents/f -X PUT --field=branch=main',
    'gh api repos/o/r/contents/f -X PUT --raw-field=branch=main',
    'gh api repos/o/r/git/refs/heads/main -X PATCH -f sha=abc',
    'gh api repos/o/r/git/refs/heads/main -X DELETE',
    'gh api repos/o/r/merges -f base=main -f head=x',
    'gh api repos/o/r/merges --field=base=main -f head=x',
    'gh api repos/o/r/merges -f "base=main" -f head=x',
  ], OWNER),
  ...each(BOTH, 'Bash', [
    'gh api repos/o/r/contents/f -X PUT --input /tmp/body.json',
    'gh api graphql -f query="$Q"',
    'gh api graphql -f query="$(cat /tmp/q.graphql)"',
    'gh api -X PUT repos/o/r/pulls/abc/merge',
  ], ANY, NO_BASES),
  ...each(BOTH, 'Bash', ["gh api repos/o/r/pulls/6/comments --jq '.[].body'"], 'allow'),
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
  ['main', 'Bash', '(cd /tmp); rm -r src', DELEGATE],
  ['coder', 'Bash', '(cd /work/main-tree); git push', 'allow', { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', '(cd /work/main-tree && git push)', OWNER, { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'echo $(cd /work/main-tree); git push', 'allow', { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'cd /work/main-tree | cat; git push', 'allow', { ...WORKTREES, agentCwd: '/work/issue-x' }],
  ['coder', 'Bash', 'if true; then cd /work/main-tree; fi; git push', ANY, { ...WORKTREES, agentCwd: '/work/issue-x' }],
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
  ...each(['reviewer'], 'Bash', [
    'git checkout x',
    'git checkout -- src/a.ts',
    'git restore src/a.ts',
    'git reset --hard',
    'git clean -fd',
    'git stash',
    'git switch -c x',
    'git commit -m x',
    'git add -A',
    'git merge x',
    'git rebase main',
    'git pull',
    'git rm a',
    'git mv a b',
    'git worktree add ../x',
    'gh pr checkout 6',
    'gh run download 5',
    'gh release download v1',
    'gh repo clone o/r',
    "awk 'BEGIN{print \"x\" > \"src/a.ts\"}'",
    "awk '{print > \"src/a.ts\"}' README.md",
    "awk 'BEGIN{system(\"rm x\")}'",
    "sed -n 'w src/a.ts' README.md",
    "sed 's/a/b/w src/a.ts' README.md",
    'git diff --output=src/a.ts',
    'git log --output=src/a.ts',
    'find . -name x -fprint src/a.ts',
    'jq . a.json > src/a.json',
    'tsx -e 1',
    'npx tsx -e 1',
    'bash -c "$X"',
    'bun -e 1',
    'deno eval 1',
    'node -p 1',
    'node --eval 1',
    'node --input-type=module -e 1',
    'python3 < x.py',
    'node < x.js',
    lines("python3 <<'EOF'", 'print(1)', 'EOF'),
    lines("cat <<'EOF' | python3", "open('a','w').write('x')", 'EOF'),
    'dd if=/dev/zero of=src/a bs=1 count=1',
    'printf x | dd of=src/a',
    "env sh -c 'echo x > src/a'",
    "xargs -I{} sh -c 'echo {} > src/a' < list",
    'cp a src/b',
    'install a src/b',
    'sort -o src/a src/b',
    'sort -u -o x x',
    'sort -rno x',
    "sed -i '' s/a/b/ x",
    'sed -ni p x',
    'rm -rf src',
    'ls > src/a',
    'exec 3> src/a',
    'echo x >| src/a',
    'echo x &> src/a',
    'echo x 1> src/a',
    'echo x 2> src/a',
    'echo x >>src/a',
    'echo x >src/a',
    'cat a 1>src/a',
    'git -c core.fsmonitor=x status',
    'rg --pre ./x foo',
    'wget https://x',
    'curl -o a https://x',
    'curl -O https://x',
    'curl --output a https://x',
    'curl --remote-name https://x',
    'curl -sSLo a https://x',
    'tar xf a.tgz',
    'unzip a.zip',
    'git apply x.diff',
    'patch -p1 < x.diff',
    'timeout 5 rm x',
    'nice rm x',
    'exec rm x',
    "eval 'rm x'",
    'if true; then rm x; fi',
    '(rm x)',
    'echo $(rm x)',
    'find . -exec rm {} +',
    'xargs rm < list',
  ], READ_ONLY),
  ...each(['reviewer'], 'Bash', [
    'cat src/a.ts | grep foo > /tmp/o',
    'git log > /tmp/log',
    'mkdir -p /tmp/x && cp a /tmp/x/',
    'rm /tmp/x',
    'mkdir -p /tmp/review/x',
    'cp a /tmp/x',
    'gh pr diff 6 > /tmp/d.diff',
    'patch -p1 --dry-run < x.diff',
    'git apply --stat x.diff',
    'git apply --numstat x.diff',
    'git apply --check --stat x.diff',
    'git apply --check -v x.diff',
    'tar -tf a.tgz',
    'tar tzf a.tgz',
    'tar -tvf cr.tgz',
    'unzip -l a.zip',
    'wget -qO- https://x',
    'python3 -m json.tool x',
    "sed -n -e 's/i/j/p' x",
    "sed -E 's/(a)/\\1/' x",
    'sort -r x',
    'sort -k2 x',
    'sort -t, -k1,1 x',
    "awk -F: '{print $1}' x",
    "awk -v x=1 '{print x}' x",
    'awk -f prog.awk x',
  ], 'allow'),
  ...each(['reviewer', 'qa-runner'], 'Bash', [
    'gh issue list | head -3',
    'curl -s https://x | jq .',
    'curl -XPOST https://x',
    'curl -s -X POST https://x',
    "curl -sS -H 'A: b' https://x | jq .",
    "find . -name '*.ts' -exec grep -l foo {} +",
    'cat src/tee-utils.ts',
    'grep -rn tee src',
    'node --test',
    'node --version',
    'python3 -m pytest -q',
    'python3 script.py -c config',
    'bash -n x.sh',
    'rm /tmp/x',
    'mkdir -p /tmp/review/x',
    'cp a /tmp/x',
  ], 'allow'),
  ...each(['reviewer', 'qa-runner'], 'Bash', ['python3 -c \'print(1)\'', 'node -e 1', 'bash -c "$X"'], READ_ONLY),
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
  ['qa-runner', 'Bash', 'echo x > /repo/qa/a', 'allow'],
  ['qa-runner', 'Bash', 'echo x > qa/a', 'allow'],
  ['qa-runner', 'Bash', 'tee /repo/qa/a < /dev/null', 'allow'],
  ['qa-runner', 'Bash', 'tee qa/a < /dev/null', 'allow'],
  ['qa-runner', 'Bash', 'cp a /repo/qa/', 'allow'],
  ['qa-runner', 'Bash', 'cp a qa/', 'allow'],
  ['qa-runner', 'Bash', 'cp -r a qa', 'allow'],
  ['qa-runner', 'Bash', 'mkdir -p /repo/qa/shots', 'allow'],
  ['qa-runner', 'Bash', 'mkdir -p qa/shots', 'allow'],
  ['qa-runner', 'Bash', 'echo x | tee -a /repo/qa/log', 'allow'],
  ['qa-runner', 'Bash', 'cd /repo/qa && echo x > a', 'allow'],
  ['qa-runner', 'Bash', 'cd qa && echo x > a', 'allow'],
  ['qa-runner', 'Bash', 'cd /tmp && echo x > a', 'allow'],
  ['qa-runner', 'Bash', 'echo x > /repo/src/a', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x > /repo/qa/../src/a', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x > /repo/qalone/a', READ_ONLY],
  ['qa-runner', 'Bash', 'cp a /repo/qa/../src/', READ_ONLY],
  ['qa-runner', 'Bash', 'cd /repo/qa; cd ..; echo x > src/a', READ_ONLY],
  ['qa-runner', 'Bash', '(cd /repo/qa); echo x > a', READ_ONLY],
  ['qa-runner', 'Bash', '(cd /repo/qa) ; touch src/a', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x | tee /repo/qa/a /repo/src/b', READ_ONLY],
  ['qa-runner', 'Bash', 'echo x | tee /repo/qa/$X', ANY],
  ['qa-runner', 'Bash', 'echo x > /repo/qa/$X', ANY],
  ['qa-runner', 'Bash', 'echo x > "$QA/a"', ANY],
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
  ...each(BOTH, 'Bash', [
    lines('git commit -m "$(cat <<\'EOF\'', 'Fix the thing', '', '- push to origin main is blocked', 'EOF', ')"'),
    lines('gh pr create --title "x" --body "$(cat <<\'EOF\'', '## Body', 'git push origin main', 'EOF', ')"'),
    lines("gh issue create --title t --body-file - <<'EOF'", 'body with $(whoami) literal', 'EOF'),
    lines("git commit -F - <<'EOF'", 'msg', 'EOF'),
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
  ['main', 'Bash', 'echo $(rm -r src', ANY],
  ['main', 'Bash', 'echo `rm -r src', ANY],
  ['main', 'Bash', 'echo ${x:-$(rm -r src', ANY],
  ['coder', 'Bash', 'echo $(git push origin main', ANY],
  ['reviewer', 'Bash', 'echo $(rm x', ANY],
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

import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Seam: the policy learns a PR's base with $.process.run(['gh', 'pr', 'view', '<n>', '--json', 'baseRefName']) and reads {"baseRefName": "..."} from stdout.
// Seam: the policy learns the current branch with a $.process.run whose argv starts with 'git' and reads the branch name from stdout.
// Seam: the policy expands a leading ~ from $.env.get('HOME').
// Seam: the policy learns a subagent's type from $.agent.list(), the entry whose id equals e.agentId, its type like 'studio-201:reviewer'.
// Seam: the policy reads the system temp dir from $.env.get('TMPDIR') and always allows /private/tmp/ and /tmp/.
// Seam: for gh pr merge with -R <repo> or --repo <repo> the policy runs gh pr view <n> -R <repo> --json baseRefName, the flag and the repo as separate argv items.

type World = {
  branch?: string
  bases?: Record<string, string>
  agents?: Record<string, string>
  tmpdir?: string
}

const SUBAGENT = 'a1'
const HOME = '/Users/me'
const OWNER_ONLY = /Only the owner merges into main\./
const TMPDIR = '/var/folders/ab/xyz/T/'
const PROCESS_OK = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

const setup = (on: On, world: World = {}) => {
  mock.env(on, { HOME, TMPDIR: world.tmpdir ?? TMPDIR })
  on('tool.call', () => ({ result: {} }))
  on('agent.list', () => ({
    value: Object.entries({ [SUBAGENT]: 'studio-201:coder', ...world.agents }).map(([id, type]) => ({
      id,
      type,
      description: type,
      status: 'running',
      kind: 'local_agent',
      taskStatus: 'running',
      label: type,
      startTime: 0,
      cwd: '/repo',
      tokenCount: 0,
      tokenSamples: [],
    })),
  }))
  on('process.run', (_, e) => {
    const [bin, ...rest] = e.argv

    if (bin === 'git') {
      return { value: { ...PROCESS_OK, stdout: `${world.branch ?? 'issue/20-policy'}\n` } }
    }

    if (bin === 'gh' && rest[0] === 'pr' && rest[1] === 'view') {
      const number = rest.find(arg => /^\d+$/.test(arg)) ?? ''
      const flag = rest.findIndex(arg => arg === '-R' || arg === '--repo')
      const repo = flag === -1 ? undefined : rest[flag + 1]
      const baseRefName = world.bases?.[repo === undefined ? number : `${repo}#${number}`]

      return { value: { ...PROCESS_OK, stdout: JSON.stringify({ baseRefName }) } }
    }

    return { value: { ...PROCESS_OK, exitCode: 127, stdout: '' } }
  })
}

const reasonOf = (result: ToolCallResult) =>
  result.deny ?? (result.isError === true ? result.text : undefined)

const expectDenied = (result: ToolCallResult, reason: RegExp) => {
  const text = reasonOf(result)

  expect(text).toBeDefined()
  expect(text).toMatch(reason)
  expect(text?.length).toBeLessThanOrEqual(160)
}

const expectAllowed = (result: ToolCallResult) => {
  expect(result.isError).toBeUndefined()
  expect(result.deny).toBeUndefined()
}

test('main session Edit of src/app.ts is denied with a message to delegate', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Edit',
    file_path: 'src/app.ts',
    old_string: 'a',
    new_string: 'b',
  })

  expectDenied(result, /delegate/i)
  expect(reasonOf(result)).toMatch(/agent/i)
})

test('main session Write of a new code file is denied', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: 'src/new-file.ts',
    content: 'export const a = 1',
  })

  expectDenied(result, /delegate/i)
})

test('main session NotebookEdit is denied', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'NotebookEdit',
    notebook_path: '/repo/analysis.ipynb',
    new_source: 'print(1)',
  })

  expectDenied(result, /delegate/i)
})

test('a subagent Edit of src/app.ts is allowed', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Edit',
    file_path: 'src/app.ts',
    old_string: 'a',
    new_string: 'b',
    agentId: SUBAGENT,
  })

  expectAllowed(result)
})

test('a subagent Write of a new code file is allowed', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: 'src/new-file.ts',
    content: 'export const a = 1',
    agentId: SUBAGENT,
  })

  expectAllowed(result)
})

test('main session Write to a memory note is allowed', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: '~/.claude/projects/x/memory/note.md',
    content: 'note',
  })

  expectAllowed(result)
})

test('main session Write to a plan file is allowed', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: '~/.claude/plans/p.md',
    content: 'plan',
  })

  expectAllowed(result)
})

test('main session Write to an absolute memory note path is allowed', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: `${HOME}/.claude/projects/x/memory/note.md`,
    content: 'note',
  })

  expectAllowed(result)
})

test('main session Write outside the notes folders is denied', async ($, on) => {
  setup(on)

  const result = await $.tool.call({
    tool: 'Write',
    file_path: '~/.claude/settings.json',
    content: '{}',
  })

  expectDenied(result, /delegate/i)
})

for (const command of [
  "sed -i 's/a/b/' src/app.ts",
  'echo x > src/app.ts',
  'echo x | tee src/app.ts',
]) {
  test(`main session Bash that writes a file is denied: ${command}`, async ($, on) => {
    setup(on)

    expectDenied(await $.tool.call({ tool: 'Bash', command }), /delegate/i)
  })

  test(`a subagent Bash that writes a file is allowed: ${command}`, async ($, on) => {
    setup(on)

    expectAllowed(await $.tool.call({ tool: 'Bash', command, agentId: SUBAGENT }))
  })
}

for (const command of ['git status', 'ls', 'gh issue list']) {
  test(`main session read-only Bash is allowed: ${command}`, async ($, on) => {
    setup(on)

    expectAllowed(await $.tool.call({ tool: 'Bash', command }))
  })
}

for (const [who, loop] of [
  ['main session', {}],
  ['subagent', { agentId: SUBAGENT }],
] as const) {
  for (const command of ['git push origin main', 'git push origin HEAD:main']) {
    test(`${who}: ${command} is denied`, async ($, on) => {
      setup(on, { branch: 'issue/20-policy' })

      expectDenied(await $.tool.call({ tool: 'Bash', command, ...loop }), OWNER_ONLY)
    })
  }

  test(`${who}: git push on the main branch is denied`, async ($, on) => {
    setup(on, { branch: 'main' })

    expectDenied(await $.tool.call({ tool: 'Bash', command: 'git push', ...loop }), OWNER_ONLY)
  })

  test(`${who}: git push origin feature/x is allowed`, async ($, on) => {
    setup(on, { branch: 'issue/20-policy' })

    expectAllowed(
      await $.tool.call({ tool: 'Bash', command: 'git push origin feature/x', ...loop }),
    )
  })

  test(`${who}: git push -u origin issue/20-policy is allowed`, async ($, on) => {
    setup(on, { branch: 'issue/20-policy' })

    expectAllowed(
      await $.tool.call({
        tool: 'Bash',
        command: 'git push -u origin issue/20-policy',
        ...loop,
      }),
    )
  })

  test(`${who}: git push on a feature branch is allowed`, async ($, on) => {
    setup(on, { branch: 'issue/20-policy' })

    expectAllowed(await $.tool.call({ tool: 'Bash', command: 'git push', ...loop }))
  })

  test(`${who}: gh pr merge 12 is denied when its base is main`, async ($, on) => {
    setup(on, { bases: { '12': 'main' } })

    expectDenied(await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12', ...loop }), OWNER_ONLY)
  })

  test(`${who}: gh pr merge 12 is allowed when its base is feature/x`, async ($, on) => {
    setup(on, { bases: { '12': 'feature/x' } })

    expectAllowed(await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12', ...loop }))
  })

  test(`${who}: gh api PUT pulls/12/merge is denied when its base is main`, async ($, on) => {
    setup(on, { bases: { '12': 'main' } })

    expectDenied(
      await $.tool.call({
        tool: 'Bash',
        command: 'gh api -X PUT repos/o/r/pulls/12/merge',
        ...loop,
      }),
      OWNER_ONLY,
    )
  })
}

const READ_ONLY_ROLES = ['scout', 'researcher', 'reviewer', 'design-critic', 'qa-runner'] as const
const READ_ONLY_REASON = /read-only/i
const REPORT_REASON = /report/i
const FILE_WRITES = [
  'echo x > src/a.ts',
  "sed -i 's/a/b/' src/a.ts",
  'echo x | tee src/a.ts',
  'cp a b',
  'mv a b',
  'rm a',
  'touch a',
]

const agentOf = (role: string) => ({ id: `${role}-1`, agents: { [`${role}-1`]: `studio-201:${role}` } })

for (const role of READ_ONLY_ROLES) {
  for (const command of FILE_WRITES) {
    test(`${role} Bash that writes a file is denied: ${command}`, async ($, on) => {
      const { id, agents } = agentOf(role)
      setup(on, { agents })

      const result = await $.tool.call({ tool: 'Bash', command, agentId: id })

      expectDenied(result, READ_ONLY_REASON)
      expect(reasonOf(result)).toMatch(REPORT_REASON)
    })
  }

  for (const command of ['git status', 'claude plugin test .', 'gh pr view 1']) {
    test(`${role} read-only Bash is allowed: ${command}`, async ($, on) => {
      const { id, agents } = agentOf(role)
      setup(on, { agents })

      expectAllowed(await $.tool.call({ tool: 'Bash', command, agentId: id }))
    })
  }
}

test('qa-runner Bash that writes under qa/ is allowed', async ($, on) => {
  const { id, agents } = agentOf('qa-runner')
  setup(on, { agents })

  expectAllowed(
    await $.tool.call({ tool: 'Bash', command: 'some-cmd > qa/v0.1/C4.txt', agentId: id }),
  )
})

test('qa-runner Bash that writes under src/ is denied', async ($, on) => {
  const { id, agents } = agentOf('qa-runner')
  setup(on, { agents })

  expectDenied(
    await $.tool.call({ tool: 'Bash', command: 'some-cmd > src/a.ts', agentId: id }),
    READ_ONLY_REASON,
  )
})

for (const role of READ_ONLY_ROLES.filter(role => role !== 'qa-runner')) {
  test(`${role} Bash that writes under qa/ is denied`, async ($, on) => {
    const { id, agents } = agentOf(role)
    setup(on, { agents })

    expectDenied(
      await $.tool.call({ tool: 'Bash', command: 'some-cmd > qa/v0.1/C4.txt', agentId: id }),
      READ_ONLY_REASON,
    )
  })
}

for (const command of FILE_WRITES) {
  test(`coder Bash that writes a file is allowed: ${command}`, async ($, on) => {
    const { id, agents } = agentOf('coder')
    setup(on, { agents })

    expectAllowed(await $.tool.call({ tool: 'Bash', command, agentId: id }))
  })
}

for (const command of [
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
]) {
  test(`main session Bash is denied: ${command}`, async ($, on) => {
    setup(on)

    expectDenied(await $.tool.call({ tool: 'Bash', command }), /delegate/i)
  })
}

for (const command of ['python -c "print(1)"', 'node -e "console.log(1)"', 'sh -c "echo x > f"']) {
  test(`coder Bash is allowed: ${command}`, async ($, on) => {
    const { id, agents } = agentOf('coder')
    setup(on, { agents })

    expectAllowed(await $.tool.call({ tool: 'Bash', command, agentId: id }))
  })
}

for (const file_path of [
  `${TMPDIR}scratch/plan.html`,
  '/private/tmp/claude-501/scratch/design.html',
  '/tmp/plan.html',
]) {
  test(`main session Write under a temp dir is allowed: ${file_path}`, async ($, on) => {
    setup(on)

    expectAllowed(await $.tool.call({ tool: 'Write', file_path, content: '<html></html>' }))
  })
}

test('main session Write under TMPDIR is allowed when TMPDIR has no trailing slash', async ($, on) => {
  setup(on, { tmpdir: '/var/folders/ab/xyz/T' })

  expectAllowed(
    await $.tool.call({
      tool: 'Write',
      file_path: '/var/folders/ab/xyz/T/scratch/plan.html',
      content: '<html></html>',
    }),
  )
})

test('main session Edit under a temp dir is allowed', async ($, on) => {
  setup(on)

  expectAllowed(
    await $.tool.call({
      tool: 'Edit',
      file_path: '/tmp/plan.html',
      old_string: 'a',
      new_string: 'b',
    }),
  )
})

for (const command of [
  'echo x > /tmp/plan.html',
  `echo x > ${TMPDIR}scratch/design.html`,
  'echo x >> /private/tmp/claude-501/scratch/notes.md',
]) {
  test(`main session Bash redirect under a temp dir is allowed: ${command}`, async ($, on) => {
    setup(on)

    expectAllowed(await $.tool.call({ tool: 'Bash', command }))
  })
}

test('main session Write that climbs out of /tmp into the repo is denied', async ($, on) => {
  setup(on)

  expectDenied(
    await $.tool.call({
      tool: 'Write',
      file_path: '/tmp/../Users/me/repo/src/a.ts',
      content: 'x',
    }),
    /delegate/i,
  )
})

test('main session Write to a folder that only starts with /tmp is denied', async ($, on) => {
  setup(on)

  expectDenied(
    await $.tool.call({ tool: 'Write', file_path: '/tmpfiles/a.ts', content: 'x' }),
    /delegate/i,
  )
})

test('main session Bash redirect to a repo file after a temp file is denied', async ($, on) => {
  setup(on)

  expectDenied(
    await $.tool.call({
      tool: 'Bash',
      command: 'echo x > /tmp/a.txt && echo y > src/app.ts',
    }),
    /delegate/i,
  )
})

for (const [who, loop] of [
  ['main session', {}],
  ['subagent', { agentId: SUBAGENT }],
] as const) {
  test(`${who}: gh api graphql mergePullRequest is denied`, async ($, on) => {
    setup(on)

    expectDenied(
      await $.tool.call({
        tool: 'Bash',
        command:
          "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"PR_1\"}) { clientMutationId } }'",
        ...loop,
      }),
      OWNER_ONLY,
    )
  })

  test(`${who}: gh api graphql query without a merge is allowed`, async ($, on) => {
    setup(on)

    expectAllowed(
      await $.tool.call({
        tool: 'Bash',
        command: "gh api graphql -f query='query { viewer { login } }'",
        ...loop,
      }),
    )
  })

  test(`${who}: gh pr merge 5 -R other/repo is denied when the base in other/repo is main`, async ($, on) => {
    setup(on, { bases: { '5': 'feature/x', 'other/repo#5': 'main' } })

    expectDenied(
      await $.tool.call({ tool: 'Bash', command: 'gh pr merge 5 -R other/repo', ...loop }),
      OWNER_ONLY,
    )
  })

  test(`${who}: gh pr merge 5 -R other/repo is allowed when the base in other/repo is feature/x`, async ($, on) => {
    setup(on, { bases: { '5': 'main', 'other/repo#5': 'feature/x' } })

    expectAllowed(
      await $.tool.call({ tool: 'Bash', command: 'gh pr merge 5 -R other/repo', ...loop }),
    )
  })

  test(`${who}: gh pr merge 5 --repo other/repo is denied when the base in other/repo is main`, async ($, on) => {
    setup(on, { bases: { '5': 'feature/x', 'other/repo#5': 'main' } })

    expectDenied(
      await $.tool.call({ tool: 'Bash', command: 'gh pr merge 5 --repo other/repo', ...loop }),
      OWNER_ONLY,
    )
  })
}

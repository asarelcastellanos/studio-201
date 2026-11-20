import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Seam: the policy learns a PR's base with $.process.run(['gh', 'pr', 'view', '<n>', '--json', 'baseRefName']) and reads {"baseRefName": "..."} from stdout.
// Seam: the policy learns the current branch with a $.process.run whose argv starts with 'git' and reads the branch name from stdout.
// Seam: the policy expands a leading ~ from $.env.get('HOME').

type World = { branch?: string; bases?: Record<string, string> }

const SUBAGENT = 'a1'
const HOME = '/Users/me'
const OWNER_ONLY = /Only the owner merges into main\./
const PROCESS_OK = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

const setup = (on: On, world: World = {}) => {
  mock.env(on, { HOME })
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    const [bin, ...rest] = e.argv

    if (bin === 'git') {
      return { value: { ...PROCESS_OK, stdout: `${world.branch ?? 'issue/20-policy'}\n` } }
    }

    if (bin === 'gh' && rest[0] === 'pr' && rest[1] === 'view') {
      const number = rest.find(arg => /^\d+$/.test(arg)) ?? ''
      const baseRefName = world.bases?.[number]

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

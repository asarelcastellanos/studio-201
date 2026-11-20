import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

type Row = [actor: 'main' | 'agent', tool: 'Edit' | 'Write' | 'NotebookEdit' | 'Bash' | 'Monitor' | 'Read', input: string, expected: 'allow' | 'refuse']

const BASES: Record<string, string> = { '5': 'main', '6': 'feature/x', '7': 'release/v0.1.0' }

const setup = (on: On) => {
  mock.env(on, { HOME: '/Users/me', TMPDIR: '/var/folders/ab/T/' })
  on('process.run', (_, e) => {
    const base = BASES[e.argv[3] ?? '']
    return {
      value: {
        exitCode: base === undefined ? 1 : 0,
        stdout: base === undefined ? '' : JSON.stringify({ baseRefName: base }),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
}

const call = ($: Engine, [actor, tool, input]: Row) => {
  const loop = actor === 'agent' ? { agentId: 'a1' } : {}

  switch (tool) {
    case 'Edit':
      return $.tool.call({ tool, file_path: input, old_string: 'a', new_string: 'b', ...loop })
    case 'Write':
      return $.tool.call({ tool, file_path: input, content: '', ...loop })
    case 'NotebookEdit':
      return $.tool.call({ tool, notebook_path: input, new_source: '', ...loop })
    case 'Bash':
      return $.tool.call({ tool, command: input, ...loop })
    case 'Monitor':
      return $.tool.call({ tool, description: 'watch', timeout_ms: 1000, command: input, ...loop })
    case 'Read':
      return $.tool.call({ tool, file_path: input, ...loop })
  }
}

const expectRows = async ($: Engine, rows: Row[]) => {
  for (const row of rows) {
    const ran = await call($, row)
    expect([row, ran.deny === undefined ? 'allow' : 'refuse']).toEqual([row, row[3]])
  }
}

test('the main session may not edit repo files', async ($, on) => {
  setup(on)
  await expectRows($, [
    ['main', 'Edit', '/Users/me/Documents/app/src/a.ts', 'refuse'],
    ['main', 'Write', '/Users/me/Documents/app/README.md', 'refuse'],
    ['main', 'NotebookEdit', '/Users/me/Documents/app/a.ipynb', 'refuse'],
    ['main', 'Edit', '/Users/me/.claude/projects/-Users-me-app/memory/MEMORY.md', 'allow'],
    ['main', 'Edit', '/Users/me/.claude/projects/-Users-me-app/notes.md', 'refuse'],
    ['main', 'Write', '/Users/me/.claude/plans/plan.md', 'allow'],
    ['main', 'Write', '/Users/me/.claude/settings.json', 'refuse'],
    ['main', 'Edit', '/Users/me/.claude/plans/../settings.json', 'refuse'],
    ['main', 'Write', '/tmp/x.txt', 'allow'],
    ['main', 'Write', '/private/tmp/x.txt', 'allow'],
    ['main', 'Write', '/var/folders/ab/T/x.txt', 'allow'],
    ['main', 'Write', '/private/var/folders/ab/T/x.txt', 'allow'],
    ['main', 'Write', '/tmp/../Users/me/app/a.ts', 'refuse'],
    ['agent', 'Edit', '/Users/me/Documents/app/src/a.ts', 'allow'],
    ['agent', 'Write', '/Users/me/Documents/app/README.md', 'allow'],
    ['main', 'Bash', 'echo hi > /Users/me/Documents/app/a.ts', 'allow'],
  ])
})

test('no actor pushes to main', async ($, on) => {
  setup(on)
  await expectRows($, [
    ['main', 'Bash', 'git push origin main', 'refuse'],
    ['agent', 'Bash', 'git push origin main', 'refuse'],
    ['agent', 'Bash', 'git push origin HEAD:main', 'refuse'],
    ['agent', 'Bash', 'git push origin x:main', 'refuse'],
    ['agent', 'Bash', 'git push origin +main', 'refuse'],
    ['agent', 'Bash', 'git push origin refs/heads/main', 'refuse'],
    ['agent', 'Bash', 'git push origin HEAD:refs/heads/main', 'refuse'],
    ['agent', 'Bash', 'git push origin :main', 'refuse'],
    ['agent', 'Bash', 'git push origin --delete main', 'refuse'],
    ['agent', 'Bash', 'git push --force origin main', 'refuse'],
    ['agent', 'Bash', 'git -C repo push origin main', 'refuse'],
    ['agent', 'Bash', 'GIT_TRACE=1 time git push origin main', 'refuse'],
    ['agent', 'Bash', 'git status && git push origin main', 'refuse'],
    ['agent', 'Bash', 'echo ok\ngit push origin main', 'refuse'],
    ['agent', 'Monitor', 'git push origin main', 'refuse'],
    ['agent', 'Bash', 'git push origin main:feature/x', 'allow'],
    ['agent', 'Bash', 'git push -u origin issue/x', 'allow'],
    ['agent', 'Bash', 'git push origin release/v0.1.0', 'allow'],
  ])
})

test('a merge is refused when it lands in main or the base is unknown', async ($, on) => {
  setup(on)
  await expectRows($, [
    ['agent', 'Bash', 'gh pr merge 5 --squash', 'refuse'],
    ['agent', 'Bash', 'gh pr merge 5 -R owner/repo', 'refuse'],
    ['agent', 'Bash', 'gh pr merge 6 && gh pr merge 5', 'refuse'],
    ['agent', 'Bash', 'gh pr merge 9 --squash', 'refuse'],
    ['agent', 'Bash', 'gh api -X PUT repos/owner/repo/pulls/5/merge', 'refuse'],
    ['agent', 'Bash', 'gh api --method=PUT repos/{owner}/{repo}/pulls/5/merge', 'refuse'],
    ['main', 'Monitor', 'gh pr merge 5', 'refuse'],
    ['agent', 'Bash', 'gh pr merge 6 --squash', 'allow'],
    ['agent', 'Bash', 'gh pr merge 7 --squash --delete-branch', 'allow'],
    ['agent', 'Bash', 'gh pr merge 6 --repo owner/repo', 'allow'],
    ['agent', 'Bash', 'gh api --method PUT repos/owner/repo/pulls/6/merge', 'allow'],
    ['agent', 'Bash', 'gh api repos/owner/repo/pulls/5/merge', 'allow'],
    ['agent', 'Bash', 'gh pr view 5', 'allow'],
  ])
})

test('everyday commands pass', async ($, on) => {
  setup(on)
  await expectRows($, [
    ['main', 'Bash', 'git commit -m "fix > bug"', 'allow'],
    ['main', 'Bash', 'gh issue create -b "a; gh pr merge 5"', 'allow'],
    ['agent', 'Bash', "git commit -m 'git push origin main'", 'allow'],
    ['agent', 'Bash', 'echo "gh pr merge 5"', 'allow'],
    ['agent', 'Bash', 'git log main..HEAD | head', 'allow'],
    ['agent', 'Bash', 'npm test 2>&1', 'allow'],
    ['agent', 'Read', '/Users/me/Documents/app/a.ts', 'allow'],
  ])
})

test('each refusal says why', async ($, on) => {
  setup(on)
  const edit = await call($, ['main', 'Edit', '/Users/me/Documents/app/a.ts', 'refuse'])
  const push = await call($, ['agent', 'Bash', 'git push origin main', 'refuse'])
  const unreadable = await call($, ['agent', 'Bash', 'gh pr merge 9', 'refuse'])

  expect(edit.deny).toMatch(/Delegate this to an agent/)
  expect(push.deny).toBe('Only the owner merges into main.')
  expect(unreadable.deny).toMatch(/Couldn't check/)
})

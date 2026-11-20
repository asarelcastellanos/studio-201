import type { AgentInfo, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

type Row = [type: string, status: string, head: string, expected: 'flagged' | 'quiet']

const CWD = '/Users/me/app'
const START = { status: '', head: 'a1' }

const agentInfo = (type: string): AgentInfo => ({
  id: 'ag1',
  description: 'task',
  type,
  status: 'running',
  kind: 'local_agent',
  taskStatus: 'running',
  label: type,
  startTime: 0,
  cwd: CWD,
  tokenCount: 0,
  tokenSamples: [],
  hasRow: false,
})

type World = { type: string; status: string; head: string; toasts: string[] }

const setup = (on: On, world: World) => {
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('agent.list', () => ({ value: [agentInfo(world.type)] }))
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('process.run', (_, e) => ({
    value: {
      exitCode: world.head === 'fail' ? 128 : 0,
      stdout: e.argv[1] === 'status' ? world.status : world.head,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
}

const rows: Row[] = [
  ['studio-201:reviewer', ' M src/a.ts\n', 'a1', 'flagged'],
  ['studio-201:reviewer', '', 'b2', 'flagged'],
  ['studio-201:scout', '?? notes.md\n', 'a1', 'flagged'],
  ['studio-201:reviewer', '', 'a1', 'quiet'],
  ['studio-201:qa-runner', '?? qa/report.md\n', 'a1', 'quiet'],
  ['studio-201:qa-runner', ' M src/a.ts\n?? qa/report.md\n', 'a1', 'flagged'],
  ['studio-201:coder', ' M src/a.ts\n', 'b2', 'quiet'],
  ['studio-201:reviewer', ' M src/a.ts\n', 'fail', 'quiet'],
]

const stop = ($: Engine, type: string) =>
  $.classic.SubagentStop({ agent_id: 'ag1', agent_type: type, agent_transcript_path: '', stop_hook_active: false })

test('a read-only agent that changed the repo is flagged', async ($, on) => {
  const world: World = { type: '', ...START, toasts: [] }
  setup(on, world)

  for (const row of rows) {
    const [type, status, head, expected] = row
    Object.assign(world, { type, ...START, toasts: [] })
    await $.classic.SubagentStart({ agent_id: 'ag1', agent_type: type })
    Object.assign(world, { status, head })
    const stopped = await stop($, type)

    const flagged = world.toasts.length === 1 && (stopped.additionalContext ?? []).length === 1
    expect([row, flagged ? 'flagged' : 'quiet']).toEqual([row, expected])
  }
})

test('the flag names the agent and at most 5 paths', async ($, on) => {
  const world: World = { type: 'studio-201:reviewer', ...START, toasts: [] }
  setup(on, world)

  await $.classic.SubagentStart({ agent_id: 'ag1', agent_type: world.type })
  world.status = [1, 2, 3, 4, 5, 6, 7].map(n => ` M f${n}.ts\n`).join('')
  const stopped = await stop($, world.type)

  expect(stopped.additionalContext).toEqual(['studio-201:reviewer is read-only but changed: f1.ts, f2.ts, f3.ts, f4.ts, f5.ts and 2 more. Flag it on the issue.'])
})

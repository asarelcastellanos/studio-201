import type { EngineInterface, On } from 'claude-code'

type Engine = Pick<EngineInterface, 'agent' | 'process' | 'ui'>
type Reading = { head: string; lines: string[] }
type Start = { type: string; cwd: string; ignore: string | undefined; reading: Reading }

const READ_ONLY = new Set(['scout', 'researcher', 'reviewer', 'design-critic', 'qa-runner'].map(role => `studio-201:${role}`))

const git = ($: Engine, cwd: string, argv: string[]) => $.process.run(['git', ...argv], { cwd, timeoutMs: 10_000 })

const read = async ($: Engine, cwd: string, ignore: string | undefined): Promise<Reading | undefined> => {
  try {
    const status = await git($, cwd, ['status', '--porcelain'])
    const head = await git($, cwd, ['rev-parse', 'HEAD'])
    if (status.exitCode !== 0 || head.exitCode !== 0) return undefined
    const lines = status.stdout.split('\n').filter(line => line !== '' && (ignore === undefined || !line.slice(3).startsWith(ignore)))
    return { head: head.stdout.trim(), lines }
  } catch {
    return undefined
  }
}

const describeChange = (type: string, before: Reading, after: Reading) => {
  const paths = [...after.lines.filter(line => !before.lines.includes(line)), ...before.lines.filter(line => !after.lines.includes(line))].map(line => line.slice(3))
  const changed = before.head === after.head ? paths : ['HEAD', ...paths]
  if (changed.length === 0) return undefined
  const more = changed.length > 5 ? ` and ${changed.length - 5} more` : ''
  return `${type} is read-only but changed: ${changed.slice(0, 5).join(', ')}${more}. Flag it on the issue.`
}

export const registerReadOnlyCheck = (on: On) => {
  const started = new Map<string, Start>()

  on('classic.SubagentStart', async ($, e, next) => {
    const agent = (await $.agent.list()).find(info => info.id === e.agent_id)
    if (agent !== undefined && READ_ONLY.has(agent.type)) {
      const ignore = agent.type === 'studio-201:qa-runner' ? 'qa/' : undefined
      const reading = await read($, agent.cwd, ignore)
      if (reading !== undefined) started.set(e.agent_id, { type: agent.type, cwd: agent.cwd, ignore, reading })
    }
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const start = started.get(e.agent_id)
    started.delete(e.agent_id)
    const after = start && (await read($, start.cwd, start.ignore))
    const message = start && after && describeChange(start.type, start.reading, after)
    const settled = await next(e)
    if (!message) return settled
    $.ui.toast(message)
    return { ...settled, additionalContext: [...(settled.additionalContext ?? []), message] }
  })
}

import type { EngineInterface } from 'claude-code'
import { isRecord, parseInstalled } from './plugins'
import { refreshAgents } from './setup'

type Engine = Pick<EngineInterface, 'command' | 'env' | 'fs' | 'plugin' | 'process' | 'store' | 'ui'>
type Outcome = { from: string; to: string; agentsFailed: boolean }

const MARKETPLACE = 'studio-201'
const PLUGIN_ID = `studio-201@${MARKETPLACE}`
const TIMEOUT_MS = 300_000

export const readVersion = (json: string) => {
  try {
    const parsed: unknown = JSON.parse(json)
    return isRecord(parsed) && typeof parsed.version === 'string' ? parsed.version : undefined
  } catch {
    return undefined
  }
}

export const describeUpdate = ({ from, to, agentsFailed }: Outcome) => {
  const parts = from === to ? [`Studio 201 v${to} is already the latest.`] : [`Updated v${from} to v${to}.`]
  if (agentsFailed) parts.push('Could not refresh the AGENTS.md copy.')
  if (from !== to) parts.push("Run /reload-plugins if the new version isn't active.")
  return parts.join(' ')
}

const lastLine = (text: string) => text.trim().split('\n').pop() ?? ''

export async function runUpdate($: Engine) {
  const from = readVersion(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  if (from === undefined) return 'Could not read the current version from plugin.json.'

  for (const args of [['marketplace', 'update', MARKETPLACE], ['update', PLUGIN_ID, '-y']]) {
    const ran = await $.process.run(['claude', 'plugin', ...args], { timeoutMs: TIMEOUT_MS })
    if (ran.exitCode !== 0) return `claude plugin ${args[0]} failed: ${lastLine(ran.stderr || ran.stdout)}`
  }

  const listed = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 60_000 })
  const installed = parseInstalled(listed.stdout).find(entry => entry.id === PLUGIN_ID)
  if (installed === undefined) return 'Updated, but the new version is not in the plugin list.'

  const agentsFailed = await refreshAgents($, installed.installPath).then(() => false, () => true)
  const to = installed.version
  if (from !== to) void $.command.run({ command: 'reload-plugins' }).catch(() => {})
  return describeUpdate({ from, to, agentsFailed })
}

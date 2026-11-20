import type { EngineInterface } from 'claude-code'
import { type Installed, parseInstalled, pluginName } from './plugins'

type Engine = Pick<EngineInterface, 'env' | 'fs' | 'plugin' | 'process' | 'store' | 'ui'>

export const IMPORT_LINE = '@~/.claude/studio-201/AGENTS.md'
const WORKBENCH = new Set(['session-monitor', 'model-policy'])

export const addImportLine = (content: string) => {
  if (content.split('\n').some(line => line.trim() === IMPORT_LINE)) return content
  const separator = content === '' || content.endsWith('\n') ? '' : '\n'
  return `${content}${separator}${IMPORT_LINE}\n`
}

export const workbenchToDisable = (installed: Installed[]) => installed.filter(entry => entry.enabled && WORKBENCH.has(pluginName(entry.id) ?? ''))

function claude($: Engine, args: string[]) {
  return $.process.run(['claude', ...args], { timeoutMs: 60_000 })
}

async function homeDir($: Engine) {
  const home = await $.env.get('HOME')
  if (home === undefined) throw new Error('HOME is not set.')
  return home
}

const copyPath = (home: string) => `${home}/.claude/studio-201/AGENTS.md`

export async function refreshAgents($: Engine, from: string) {
  const target = copyPath(await homeDir($))
  if (!(await $.fs.exists(target))) return false
  await $.fs.write(target, await $.fs.read(`${from}/AGENTS.md`))
  return true
}

async function copyAgents($: Engine, home: string) {
  await $.fs.write(copyPath(home), await $.fs.read(`${$.plugin.root}/AGENTS.md`))
  return 'Copied AGENTS.md to ~/.claude/studio-201/AGENTS.md.'
}

async function importAgents($: Engine, home: string) {
  const path = `${home}/.claude/CLAUDE.md`
  const content = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  const next = addImportLine(content)
  if (next === content) return '~/.claude/CLAUDE.md already imports the shared rules.'
  await $.fs.write(path, next)
  return 'Added the import line to ~/.claude/CLAUDE.md.'
}

async function linkCodex($: Engine, home: string) {
  const dir = `${home}/.codex`
  const link = `${dir}/AGENTS.md`
  if (!(await $.fs.exists(dir))) return 'Did not link Codex: ~/.codex does not exist.'
  const current = await $.process.run(['readlink', link])
  if (current.exitCode === 0 && current.stdout.trim() === copyPath(home)) return 'Codex already reads the shared rules.'
  if (await $.fs.exists(link)) return 'Did not link Codex: ~/.codex/AGENTS.md already exists.'
  const made = await $.process.run(['ln', '-s', copyPath(home), link])
  return made.exitCode === 0 ? 'Linked ~/.codex/AGENTS.md to the shared rules.' : `Did not link Codex: ${made.stderr.trim()}`
}

async function disableWorkbench($: Engine) {
  const listed = await claude($, ['plugin', 'list', '--json'])
  if (listed.exitCode !== 0) return ['Did not touch the claude-workbench plugins: claude plugin list failed.']
  const targets = workbenchToDisable(parseInstalled(listed.stdout))
  if (targets.length === 0) return ['No claude-workbench monitor or model-policy plugin is enabled.']
  const lines: string[] = []
  for (const { id, scope } of targets) {
    const ran = await claude($, ['plugin', 'disable', id, ...(scope === 'session' ? [] : ['--scope', scope])])
    lines.push(ran.exitCode === 0 ? `Disabled ${id}.` : `Could not disable ${id}: ${ran.stderr.trim()}`)
  }
  return lines
}

export async function runSetup($: Engine) {
  const home = await homeDir($)
  const lines = [await copyAgents($, home), await importAgents($, home), await linkCodex($, home), ...(await disableWorkbench($))]
  await $.store.set('setup', 'done')
  return lines.join('\n')
}

export async function firstRun($: Engine) {
  if ((await $.store.get('setup')) !== undefined) return undefined
  const answer = await $.ui
    .ask('Set up Studio 201 now? It copies AGENTS.md to ~/.claude/studio-201, adds one import line to ~/.claude/CLAUDE.md, links it for Codex, and turns off the claude-workbench monitor and model-policy plugins.', ['Yes', 'No'])
    .catch(() => undefined)
  if (answer === undefined) return 'Run /studio setup to connect Studio 201 to this Mac.'
  if (answer !== 'Yes') {
    await $.store.set('setup', 'declined')
    return 'Skipped setup. Run /studio setup any time.'
  }
  return runSetup($)
}

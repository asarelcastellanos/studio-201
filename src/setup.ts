import type { EngineInterface } from 'claude-code'
import { type Installed, parseInstalled, pluginName } from './plugins'

type Engine = Pick<EngineInterface, 'env' | 'fs' | 'plugin' | 'process' | 'store' | 'ui'>

export const IMPORT_LINE = '@~/.claude/studio-201/AGENTS.md'
const WORKBENCH = new Set(['session-monitor', 'model-policy'])
const DISABLE_SCOPES = new Set(['user', 'session'])

const DETAILS =
  'Studio 201 setup copies AGENTS.md to ~/.claude/studio-201, adds one import line to ~/.claude/CLAUDE.md, links ~/.codex/AGENTS.md when Codex is set up, and disables the claude-workbench session-monitor and model-policy plugins. The disable step writes to ~/.claude/settings.json through the claude CLI.'

export const addImportLine = (content: string) => {
  if (content.split('\n').some(line => line.trim() === IMPORT_LINE)) return content
  const separator = content === '' || content.endsWith('\n') ? '' : '\n'
  return `${content}${separator}${IMPORT_LINE}\n`
}

export const workbenchToDisable = (installed: Installed[]) => {
  const found = installed.filter(entry => entry.enabled && WORKBENCH.has(pluginName(entry.id) ?? ''))
  return { disable: found.filter(entry => DISABLE_SCOPES.has(entry.scope)), skipped: found.filter(entry => !DISABLE_SCOPES.has(entry.scope)) }
}

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
  const { disable, skipped } = workbenchToDisable(parseInstalled(listed.stdout))
  if (disable.length === 0 && skipped.length === 0) return ['No claude-workbench monitor or model-policy plugin is enabled.']
  const lines: string[] = []
  let disabled = false
  for (const { id, scope } of disable) {
    const ran = await claude($, ['plugin', 'disable', id, ...(scope === 'session' ? [] : ['--scope', scope])])
    disabled = disabled || ran.exitCode === 0
    lines.push(ran.exitCode === 0 ? `Disabled ${id} in ~/.claude/settings.json. Undo with: claude plugin enable ${id}` : `Could not disable ${id}: ${ran.stderr.trim()}`)
  }
  if (disabled) lines.push('Running sessions keep these plugins until restart.')
  for (const { id, scope } of skipped) lines.push(`Skipped ${id}: it is installed at ${scope} scope. Disable it by hand with: claude plugin disable ${id} --scope ${scope}`)
  return lines
}

async function step(label: string, job: Promise<string | string[]>) {
  try {
    return [await job].flat()
  } catch (error) {
    return [`${label} failed: ${error instanceof Error ? error.message : String(error)}`]
  }
}

export async function runSetup($: Engine) {
  const home = await homeDir($)
  const lines = [
    ...(await step('Copying AGENTS.md', copyAgents($, home))),
    ...(await step('Adding the import line', importAgents($, home))),
    ...(await step('Linking Codex', linkCodex($, home))),
    ...(await step('Disabling the workbench plugins', disableWorkbench($))),
  ]
  await $.store.set('setup', 'done')
  return lines.join('\n')
}

export async function firstRun($: Engine) {
  if ((await $.store.get('setup')) !== undefined) return undefined
  $.ui.log(DETAILS)
  const answer = await $.ui.ask('Set up Studio 201? It edits ~/.claude/CLAUDE.md and ~/.claude/settings.json.', ['Yes', 'No']).catch(() => undefined)
  if (answer === undefined) return 'Run /studio setup to connect Studio 201 to this Mac.'
  if (answer !== 'Yes') {
    await $.store.set('setup', 'declined')
    return 'Skipped setup. Run /studio setup any time.'
  }
  return runSetup($)
}

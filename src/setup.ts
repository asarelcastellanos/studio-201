export const BACKUP_SUFFIX = '.studio-201.bak'
export const RESTART_NOTICE = 'Restart Claude Code to load the rules.'

const PLUGIN_DIRS_KEY = 'CLAUDE_CODE_PLUGIN_DIRS'
const WORKBENCH_MODS: ReadonlySet<string> = new Set(['model-policy', 'session-monitor', 'session-coach'])
const WORKBENCH_IMPORT = /^@\S*\/claude-workbench\/CLAUDE\.md$/

export type Paths = {
	agentsCopy: string
	claudeMd: string
	settings: string
	codexDir: string
	codexAgents: string
}

export function pathsFor(home: string, configDir: string | undefined): Paths {
	const claudeDir = configDir === undefined || configDir === '' ? `${home}/.claude` : configDir.replace(/\/+$/, '')
	const codexDir = `${home}/.codex`
	return {
		agentsCopy: `${claudeDir}/studio-201/AGENTS.md`,
		claudeMd: `${claudeDir}/CLAUDE.md`,
		settings: `${claudeDir}/settings.json`,
		codexDir,
		codexAgents: `${codexDir}/AGENTS.md`,
	}
}

export type CodexState = 'no-codex' | 'missing' | 'ours' | 'foreign'

export type Snapshot = {
	source: string
	copy: string | undefined
	claudeMd: string | undefined
	settings: string | undefined
	codex: CodexState
}

export type Step =
	| { kind: 'write'; path: string; text: string; backup: string | undefined; lines: string[] }
	| { kind: 'link'; path: string; target: string; lines: string[] }

export type Plan = { steps: Step[]; notes: string[] }

export type SetupIo = {
	read: (path: string) => Promise<string | undefined>
	write: (path: string, text: string) => Promise<void>
	exists: (path: string) => Promise<boolean>
	list: (dir: string) => Promise<readonly { name: string }[] | undefined>
	readlink: (path: string) => Promise<string | undefined>
	link: (path: string, target: string) => Promise<void>
}

type ParsedSettings = { ok: true; data: Record<string, unknown>; indent: string | number } | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSettings(raw: string): ParsedSettings {
	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch {
		return { ok: false, reason: 'it is not valid JSON' }
	}
	if (!isRecord(data)) return { ok: false, reason: 'it does not hold a JSON object' }
	if (data.env !== undefined && !isRecord(data.env)) return { ok: false, reason: 'its env is not an object' }
	const dirs = isRecord(data.env) ? data.env[PLUGIN_DIRS_KEY] : undefined
	if (dirs !== undefined && typeof dirs !== 'string') return { ok: false, reason: `its ${PLUGIN_DIRS_KEY} is not a string` }
	return { ok: true, data, indent: /^([ \t]+)"/m.exec(raw)?.[1] ?? 2 }
}

function workbenchModName(entry: string): string | undefined {
	const parts = entry.replace(/\/+$/, '').split('/')
	const name = parts.at(-1) ?? ''
	return parts.at(-2) === 'mods' && WORKBENCH_MODS.has(name) ? name : undefined
}

export function planAgentsCopy(source: string, copy: string | undefined, paths: Paths): Step | undefined {
	if (copy === source) return undefined
	const verb = copy === undefined ? 'Copy' : 'Refresh'
	return {
		kind: 'write',
		path: paths.agentsCopy,
		text: source,
		backup: undefined,
		lines: [`${verb} AGENTS.md to ${paths.agentsCopy}`],
	}
}

function planClaudeMd(current: string | undefined, paths: Paths): Step | undefined {
	const importLine = `@${paths.agentsCopy}`
	const lines = (current ?? '').split('\n')
	const kept: string[] = []
	let removes = false
	let justRemoved = false
	for (const line of lines) {
		if (WORKBENCH_IMPORT.test(line.trim())) {
			removes = true
			justRemoved = true
			continue
		}
		const strandedBlank = justRemoved && line.trim() === '' && (kept.length === 0 || kept.at(-1)?.trim() === '')
		justRemoved = false
		if (!strandedBlank) kept.push(line)
	}
	const adds = !kept.some(line => line.trim() === importLine)
	if (!removes && !adds) return undefined
	let text = kept.join('\n')
	if (adds) {
		if (text.trim() === '') text = `${importLine}\n`
		else text = `${text}${text.endsWith('\n') ? '' : '\n'}\n${importLine}\n`
	}
	const summary: string[] = []
	if (removes) summary.push(`Remove the claude-workbench import from ${paths.claudeMd}`)
	if (adds) summary.push(current === undefined ? `Create ${paths.claudeMd} with ${importLine}` : `Add ${importLine} to ${paths.claudeMd}`)
	return { kind: 'write', path: paths.claudeMd, text, backup: current, lines: summary }
}

function planSettings(raw: string | undefined, paths: Paths): { step?: Step; note?: string } {
	if (raw === undefined) return {}
	const parsed = parseSettings(raw)
	if (!parsed.ok) return { note: `${paths.settings} was left alone because ${parsed.reason}.` }
	const env = parsed.data.env
	if (!isRecord(env) || typeof env[PLUGIN_DIRS_KEY] !== 'string') return {}
	const entries = env[PLUGIN_DIRS_KEY].split(':').filter(entry => entry !== '')
	const removed = entries.flatMap(entry => workbenchModName(entry) ?? [])
	if (removed.length === 0) return {}
	const remaining = entries.filter(entry => workbenchModName(entry) === undefined)
	const next = { ...env }
	if (remaining.length === 0) delete next[PLUGIN_DIRS_KEY]
	else next[PLUGIN_DIRS_KEY] = remaining.join(':')
	const text = `${JSON.stringify({ ...parsed.data, env: next }, null, parsed.indent)}\n`
	return {
		step: {
			kind: 'write',
			path: paths.settings,
			text,
			backup: raw,
			lines: [`Turn off the claude-workbench mods ${removed.join(', ')} in ${paths.settings}`],
		},
	}
}

export function planSetup(snapshot: Snapshot, paths: Paths): Plan {
	const steps: Step[] = []
	const notes: string[] = []
	const copy = planAgentsCopy(snapshot.source, snapshot.copy, paths)
	if (copy !== undefined) steps.push(copy)
	const claudeMd = planClaudeMd(snapshot.claudeMd, paths)
	if (claudeMd !== undefined) steps.push(claudeMd)
	switch (snapshot.codex) {
		case 'missing':
			steps.push({
				kind: 'link',
				path: paths.codexAgents,
				target: paths.agentsCopy,
				lines: [`Link ${paths.codexAgents} to ${paths.agentsCopy}`],
			})
			break
		case 'foreign':
			notes.push(`${paths.codexAgents} already exists and is not the Studio 201 link, so it was left alone.`)
			break
		case 'no-codex':
			notes.push(`${paths.codexDir} does not exist, so Codex was not linked.`)
			break
		case 'ours':
			break
	}
	const settings = planSettings(snapshot.settings, paths)
	if (settings.step !== undefined) steps.push(settings.step)
	if (settings.note !== undefined) notes.push(settings.note)
	return { steps, notes }
}

export async function readSnapshot(io: SetupIo, paths: Paths, sourcePath: string): Promise<Snapshot> {
	const source = await io.read(sourcePath)
	if (source === undefined) throw new Error(`${sourcePath} is missing`)
	const entries = await io.list(paths.codexDir)
	let codex: CodexState = 'no-codex'
	if (entries !== undefined) {
		codex = 'missing'
		if (entries.some(entry => entry.name === 'AGENTS.md')) {
			codex = (await io.readlink(paths.codexAgents)) === paths.agentsCopy ? 'ours' : 'foreign'
		}
	}
	return {
		source,
		copy: await io.read(paths.agentsCopy),
		claudeMd: await io.read(paths.claudeMd),
		settings: await io.read(paths.settings),
		codex,
	}
}

export async function applyPlan(io: SetupIo, plan: Plan): Promise<string[]> {
	const backups: string[] = []
	for (const step of plan.steps) {
		if (step.kind === 'link') {
			await io.link(step.path, step.target)
			continue
		}
		if (step.backup !== undefined) {
			const backupPath = `${step.path}${BACKUP_SUFFIX}`
			if (!(await io.exists(backupPath))) {
				await io.write(backupPath, step.backup)
				backups.push(backupPath)
			}
		}
		await io.write(step.path, step.text)
	}
	return backups
}

function bullets(items: readonly string[]): string {
	return items.map(item => `- ${item}`).join('\n')
}

export function describePlan(plan: Plan): string {
	const parts = ['Studio 201 setup will make these changes.', bullets(plan.steps.flatMap(step => step.lines))]
	if (plan.steps.some(step => step.kind === 'write' && step.backup !== undefined)) {
		parts.push(`Each edited file is backed up first as <file>${BACKUP_SUFFIX}.`)
	}
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	parts.push('Apply these changes?')
	return parts.join('\n\n')
}

export function describeResult(plan: Plan, backups: readonly string[]): string {
	const parts = ['Studio 201 setup changed:', bullets(plan.steps.flatMap(step => step.lines))]
	if (backups.length > 0) parts.push(`Backups:\n${bullets(backups)}`)
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	parts.push(RESTART_NOTICE)
	return parts.join('\n\n')
}

export function describeNothing(plan: Plan): string {
	const parts = ['Studio 201 is already set up. Nothing changed.']
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	return parts.join('\n\n')
}

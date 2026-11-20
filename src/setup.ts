export const RESTART_NOTICE = 'Restart Claude Code to load the rules.'
export const ARCHIVE = 'Archive it'
export const DELETE = 'Delete it'

const PLUGIN_DIRS_KEY = 'CLAUDE_CODE_PLUGIN_DIRS'
const AGENT_DIRS = ['agents', 'skills', 'commands'] as const
const IGNORED_NAMES: ReadonlySet<string> = new Set(['.DS_Store'])
const SHOWN_PER_GROUP = 8

export type AgentDir = (typeof AGENT_DIRS)[number]
export type Mode = 'archive' | 'delete'

export type Paths = {
	claudeDir: string
	agentsCopy: string
	archiveRoot: string
	claudeMd: string
	settings: string
	codexDir: string
	codexAgents: string
}

export function pathsFor(home: string, configDir: string | undefined): Paths {
	const claudeDir = configDir === undefined || configDir === '' ? `${home}/.claude` : configDir.replace(/\/+$/, '')
	const codexDir = `${home}/.codex`
	return {
		claudeDir,
		agentsCopy: `${claudeDir}/studio-201/AGENTS.md`,
		archiveRoot: `${claudeDir}/studio-201/archive`,
		claudeMd: `${claudeDir}/CLAUDE.md`,
		settings: `${claudeDir}/settings.json`,
		codexDir,
		codexAgents: `${codexDir}/AGENTS.md`,
	}
}

export type CodexState = 'no-codex' | 'missing' | 'ours' | 'foreign'
export type DirState = { isLink: boolean; names: string[] }

export type Snapshot = {
	source: string
	copy: string | undefined
	claudeMd: { text: string; isLink: boolean } | undefined
	settings: string | undefined
	codex: CodexState
	dirs: Record<AgentDir, DirState | undefined>
}

export type Group = 'rules' | 'hooks' | 'agents'

export type Item =
	| { how: 'move'; group: Group; path: string; rel: string }
	| { how: 'save'; group: Group; path: string; rel: string; text: string; hint: string; label: string }

export type Step =
	| { kind: 'write'; path: string; text: string; lines: string[] }
	| { kind: 'link'; path: string; target: string; lines: string[] }

export type Plan = { items: Item[]; steps: Step[]; notes: string[]; blocked: string | undefined }

export type SetupIo = {
	read: (path: string) => Promise<string | undefined>
	write: (path: string, text: string) => Promise<void>
	writeAtomic: (path: string, text: string) => Promise<void>
	exists: (path: string) => Promise<boolean>
	list: (dir: string) => Promise<readonly string[] | undefined>
	isLink: (path: string) => Promise<boolean>
	readlink: (path: string) => Promise<string | undefined>
	link: (path: string, target: string) => Promise<void>
	move: (from: string, to: string) => Promise<void>
	remove: (path: string) => Promise<void>
}

export class SetupFailure extends Error {
	readonly done: readonly string[]
	readonly archiveDir: string | undefined

	constructor(message: string, done: readonly string[], archiveDir: string | undefined) {
		super(message)
		this.done = done
		this.archiveDir = archiveDir
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parentDir(path: string): string {
	return path.slice(0, Math.max(path.lastIndexOf('/'), 0))
}

function eolOf(text: string): string {
	return text.includes('\r\n') ? '\r\n' : '\n'
}

function importLineFor(paths: Paths): string {
	return `@${paths.agentsCopy}`
}

export function planAgentsCopy(source: string, copy: string | undefined, paths: Paths): Step | undefined {
	if (copy === source) return undefined
	const verb = copy === undefined ? 'Copy' : 'Refresh'
	return { kind: 'write', path: paths.agentsCopy, text: source, lines: [`${verb} AGENTS.md to ${paths.agentsCopy}`] }
}

function planClaudeMd(current: Snapshot['claudeMd'], paths: Paths): { item?: Item; step?: Step } {
	const importLine = importLineFor(paths)
	if (current === undefined) {
		return {
			step: { kind: 'write', path: paths.claudeMd, text: `${importLine}\n`, lines: [`Create ${paths.claudeMd} with ${importLine}`] },
		}
	}
	const filled = current.text
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line !== '')
	const onlyImport = filled.length > 0 && filled.every(line => line === importLine)
	if (onlyImport && !current.isLink) return {}
	const step: Step = {
		kind: 'write',
		path: paths.claudeMd,
		text: `${importLine}${eolOf(current.text)}`,
		lines: [`Make ${paths.claudeMd} only the line ${importLine}`],
	}
	if (current.isLink) return { item: { how: 'move', group: 'rules', path: paths.claudeMd, rel: 'CLAUDE.md' }, step }
	if (filled.length === 0) return { step }
	return {
		item: {
			how: 'save',
			group: 'rules',
			path: paths.claudeMd,
			rel: 'CLAUDE.md',
			text: current.text,
			label: paths.claudeMd,
			hint: `Copy it back over ${paths.claudeMd}. Studio 201 rules then load only if the file also keeps the line ${importLine}.`,
		},
		step,
	}
}

type SettingsPlan = { item?: Item; step?: Step; blocked?: string }

function planSettings(raw: string | undefined, paths: Paths): SettingsPlan {
	if (raw === undefined) return {}
	const bom = raw.startsWith('﻿') ? '﻿' : ''
	const fail = (reason: string): SettingsPlan => ({
		blocked: `${paths.settings} ${reason}. Nothing was changed. Fix the file, then run /studio setup.`,
	})
	let data: unknown
	try {
		data = JSON.parse(raw.slice(bom.length))
	} catch {
		return fail('is not strict JSON (it may have a comment or a trailing comma)')
	}
	if (!isRecord(data)) return fail('does not hold a JSON object')
	const env = data.env
	if (env !== undefined && !isRecord(env)) return fail('has an env that is not an object')
	const dirs = isRecord(env) ? env[PLUGIN_DIRS_KEY] : undefined
	if (dirs !== undefined && typeof dirs !== 'string') return fail(`has an env.${PLUGIN_DIRS_KEY} that is not a string`)
	const entries = (dirs ?? '').split(':').filter(entry => entry !== '')
	const hooks = data.hooks
	const hasHooks = hooks !== undefined && !(isRecord(hooks) && Object.keys(hooks).length === 0)
	if (entries.length === 0 && !hasHooks) return {}
	const removed: Record<string, unknown> = {}
	const parts: string[] = []
	const next: Record<string, unknown> = { ...data }
	if (entries.length > 0 && isRecord(env)) {
		removed.env = { [PLUGIN_DIRS_KEY]: dirs }
		parts.push(`env.${PLUGIN_DIRS_KEY} (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`)
		const rest = { ...env }
		delete rest[PLUGIN_DIRS_KEY]
		if (Object.keys(rest).length === 0) delete next.env
		else next.env = rest
	}
	if (hasHooks) {
		removed.hooks = hooks
		parts.push('hooks')
		delete next.hooks
	}
	const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? 2
	const eol = eolOf(raw)
	const text = bom + JSON.stringify(next, null, indent).replace(/\n/g, eol) + eol
	return {
		item: {
			how: 'save',
			group: 'hooks',
			path: paths.settings,
			rel: 'settings.json',
			text: `${JSON.stringify(removed, null, 2)}\n`,
			label: `${paths.settings}: ${parts.join(' and ')}`,
			hint: `Merge the keys in the saved settings.json back into ${paths.settings}.`,
		},
		step: { kind: 'write', path: paths.settings, text, lines: [`Remove ${parts.join(' and ')} from ${paths.settings}`] },
	}
}

function codexLink(paths: Paths): Step {
	return {
		kind: 'link',
		path: paths.codexAgents,
		target: paths.agentsCopy,
		lines: [`Link ${paths.codexAgents} to ${paths.agentsCopy}`],
	}
}

export function planSetup(snapshot: Snapshot, paths: Paths): Plan {
	const items: Item[] = []
	const steps: Step[] = []
	const notes: string[] = []
	const settings = planSettings(snapshot.settings, paths)
	if (settings.blocked !== undefined) return { items, steps, notes, blocked: settings.blocked }
	const copy = planAgentsCopy(snapshot.source, snapshot.copy, paths)
	if (copy !== undefined) steps.push(copy)
	const claudeMd = planClaudeMd(snapshot.claudeMd, paths)
	if (claudeMd.item !== undefined) items.push(claudeMd.item)
	if (claudeMd.step !== undefined) steps.push(claudeMd.step)
	switch (snapshot.codex) {
		case 'foreign':
			items.push({ how: 'move', group: 'rules', path: paths.codexAgents, rel: 'codex/AGENTS.md' })
			steps.push(codexLink(paths))
			break
		case 'missing':
			steps.push(codexLink(paths))
			break
		case 'no-codex':
			notes.push(`${paths.codexDir} does not exist, so Codex was not linked.`)
			break
		case 'ours':
			break
	}
	for (const name of AGENT_DIRS) {
		const state = snapshot.dirs[name]
		if (state === undefined) continue
		const dir = `${paths.claudeDir}/${name}`
		if (state.isLink) {
			items.push({ how: 'move', group: 'agents', path: dir, rel: name })
			continue
		}
		for (const entry of [...state.names].sort()) {
			items.push({ how: 'move', group: 'agents', path: `${dir}/${entry}`, rel: `${name}/${entry}` })
		}
	}
	if (settings.item !== undefined) items.push(settings.item)
	if (settings.step !== undefined) steps.push(settings.step)
	return { items, steps, notes, blocked: undefined }
}

export async function readSnapshot(io: SetupIo, paths: Paths, sourcePath: string): Promise<Snapshot> {
	const source = await io.read(sourcePath)
	if (source === undefined) throw new Error(`${sourcePath} is missing`)
	const codexEntries = await io.list(paths.codexDir)
	let codex: CodexState = 'no-codex'
	if (codexEntries !== undefined) {
		codex = 'missing'
		if (codexEntries.includes('AGENTS.md')) {
			codex = (await io.readlink(paths.codexAgents)) === paths.agentsCopy ? 'ours' : 'foreign'
		}
	}
	const claudeMdText = await io.read(paths.claudeMd)
	const dirs: Snapshot['dirs'] = { agents: undefined, skills: undefined, commands: undefined }
	for (const name of AGENT_DIRS) {
		const path = `${paths.claudeDir}/${name}`
		const names = (await io.list(path))?.filter(entry => !IGNORED_NAMES.has(entry))
		if (names !== undefined && names.length > 0) dirs[name] = { isLink: await io.isLink(path), names: [...names] }
	}
	return {
		source,
		copy: await io.read(paths.agentsCopy),
		claudeMd: claudeMdText === undefined ? undefined : { text: claudeMdText, isLink: await io.isLink(paths.claudeMd) },
		settings: await io.read(paths.settings),
		codex,
		dirs,
	}
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

export function archiveStamp(ms: number): string {
	const date = new Date(ms)
	const two = (n: number): string => String(n).padStart(2, '0')
	const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
	return `${day}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

function quoted(path: string): string {
	return `'${path.replace(/'/g, `'\\''`)}'`
}

function itemLabel(item: Item): string {
	return item.how === 'save' ? item.label : item.path
}

export function restoreNotes(items: readonly Item[], archiveDir: string, stamp: string): string {
	const lines = [
		'# Restore',
		'',
		`Studio 201 setup archived these items on ${stamp}. Each one is in this folder at the same relative path.`,
		'',
	]
	for (const item of items) {
		lines.push(`## ${itemLabel(item)}`, '', `Archived at ${archiveDir}/${item.rel}.`, '')
		if (item.how === 'move') {
			lines.push('To put it back, run:', '', `    mv ${quoted(`${archiveDir}/${item.rel}`)} ${quoted(item.path)}`, '')
		} else {
			lines.push(item.hint, '')
		}
	}
	lines.push('Putting items back turns the old setup on again beside Studio 201. Restart Claude Code after you do.', '')
	return lines.join('\n')
}

async function freshArchiveDir(io: SetupIo, paths: Paths, stamp: string): Promise<string> {
	for (let n = 1; n < 100; n++) {
		const dir = `${paths.archiveRoot}/${n === 1 ? stamp : `${stamp}-${n}`}`
		if (!(await io.exists(dir))) return dir
	}
	throw new Error(`could not find a free archive folder under ${paths.archiveRoot}`)
}

export async function applySteps(io: SetupIo, steps: readonly Step[], done: string[] = []): Promise<void> {
	for (const step of steps) {
		if (step.kind === 'link') await io.link(step.path, step.target)
		else await io.writeAtomic(step.path, step.text)
		done.push(...step.lines)
	}
}

export type Applied = { done: string[]; archiveDir: string | undefined }

export async function applyPlan(io: SetupIo, paths: Paths, plan: Plan, mode: Mode, stamp: string): Promise<Applied> {
	const done: string[] = []
	let archiveDir: string | undefined
	try {
		if (plan.items.length > 0 && mode === 'archive') {
			archiveDir = await freshArchiveDir(io, paths, stamp)
			for (const item of plan.items) {
				const target = `${archiveDir}/${item.rel}`
				if (item.how === 'move') {
					await io.move(item.path, target)
					done.push(`Moved ${item.path} to ${target}`)
				} else {
					await io.write(target, item.text)
					done.push(`Saved a copy of ${item.label} at ${target}`)
				}
			}
			await io.write(`${archiveDir}/RESTORE.md`, restoreNotes(plan.items, archiveDir, stamp))
			done.push(`Wrote ${archiveDir}/RESTORE.md`)
		} else {
			for (const item of plan.items) {
				if (item.how !== 'move') continue
				await io.remove(item.path)
				done.push(`Deleted ${item.path}`)
			}
		}
		await applySteps(io, plan.steps, done)
	} catch (error) {
		throw new SetupFailure(error instanceof Error ? error.message : String(error), done, archiveDir)
	}
	return { done, archiveDir }
}

function bullets(items: readonly string[]): string {
	return items.map(item => `- ${item}`).join('\n')
}

const GROUP_TITLES: Record<Group, string> = {
	rules: 'Rules',
	hooks: 'Mods and hooks',
	agents: 'Agents, skills and commands',
}

export function describeFound(items: readonly Item[]): string {
	const sections: string[] = []
	for (const group of ['rules', 'hooks', 'agents'] as const) {
		const labels = items.filter(item => item.group === group).map(itemLabel)
		if (labels.length === 0) continue
		const shown = labels.slice(0, SHOWN_PER_GROUP)
		if (labels.length > shown.length) shown.push(`and ${labels.length - shown.length} more`)
		sections.push(`${GROUP_TITLES[group]}\n${bullets(shown)}`)
	}
	return sections.join('\n\n')
}

export function describePlan(plan: Plan, paths: Paths): string {
	const parts = [
		'Studio 201 makes Claude run on its own rules, agents and skills. Setup found an existing setup that would compete with it.',
		describeFound(plan.items),
		`Archive it moves each item to ${paths.archiveRoot}/<date-time>/ and writes a RESTORE.md that says how to put it back. Delete it removes the items for good. Neither keeps the old setup active.`,
		'Credentials, other settings, other plugins, MCP connectors, projects, memory and history stay as they are.',
		`Then setup installs Studio 201:\n${bullets(plan.steps.flatMap(step => step.lines))}`,
	]
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	parts.push('Archive it or delete it?')
	return parts.join('\n\n')
}

export function describeResult(plan: Plan, mode: Mode, applied: Applied): string {
	const parts = ['Studio 201 setup finished.']
	if (applied.archiveDir !== undefined) {
		parts.push(`Archived the old setup to ${applied.archiveDir}. RESTORE.md there says how to put it back.`)
	} else if (plan.items.length > 0 && mode === 'delete') {
		parts.push('Deleted the old setup.')
	}
	parts.push(`Installed:\n${bullets(plan.steps.flatMap(step => step.lines))}`)
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	parts.push(RESTART_NOTICE)
	return parts.join('\n\n')
}

export function describeFailure(error: SetupFailure): string {
	const parts = [`Setup stopped: ${error.message}`]
	parts.push(error.done.length === 0 ? 'Nothing had been changed yet.' : `Already done:\n${bullets(error.done)}`)
	if (error.archiveDir !== undefined) parts.push(`The archive is at ${error.archiveDir}.`)
	parts.push('Setup is not marked done. Run /studio setup after you fix the problem.')
	return parts.join('\n\n')
}

export function describeNothing(plan: Plan): string {
	const parts = ['Studio 201 is already set up. Nothing changed.']
	if (plan.notes.length > 0) parts.push(`Left alone:\n${bullets(plan.notes)}`)
	return parts.join('\n\n')
}

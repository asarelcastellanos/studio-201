import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ASK_REASON, MERGE_REFUSAL, mergesIntoMain } from '../src/merge'
import type { Lookup } from '../src/merge'
import { REFUSAL, bashWritesCode, isCodePath, readOnlyRefusal, readOnlyRole } from '../src/policy'
import type { PolicyContext } from '../src/policy'
import { applyPlan, describeNothing, describePlan, describeResult, pathsFor, planSetup, readSnapshot } from '../src/setup'
import type { Paths, SetupIo } from '../src/setup'
import { runUpdate } from '../src/update'
import type { UpdateIo } from '../src/update'

const NAME = 'studio'
const LOOKUP_BUDGET_MS = 20000
const policyAtom = atom({ plugin: 'studio-201', key: 'policy' } as const, true)
const USAGE = 'Usage: /studio policy [on|off], /studio setup or /studio update'
const UPDATE_TOOL = 'studio_update'
const UPDATE_TOOL_ID = 'mcp__studio-201__studio_update'
const UPDATE_TOOL_DESCRIPTION =
	'Updates the Studio 201 plugin to the latest version and reports the old and new version. Call it only when the user asks to update, upgrade or get the latest Studio 201. It pulls the local clone of the plugin if there is one, updates the marketplace and the plugin, and refreshes the AGENTS.md copy if setup has run. It takes no input. Give the user its result as it is.'
const SETUP_KEY = 'setup'
const APPLY = 'Apply changes'
const SKIP = 'Not now'
const UPDATE_STEP_TIMEOUT_MS = 120000
const RELOAD_DELAY_MS = 1500

async function policyCommand($: EngineInterface, args: string): Promise<string> {
	const arg = args.trim().toLowerCase()
	if (arg === 'on' || arg === 'off') await update($, policyAtom, () => arg === 'on')
	else if (arg !== '') return USAGE
	return (await read($, policyAtom)) ? 'on' : 'off'
}

function setupIo($: EngineInterface): SetupIo {
	return {
		read: async path => ((await $.fs.exists(path)) ? await $.fs.read(path) : undefined),
		write: (path, text) => $.fs.write(path, text),
		exists: path => $.fs.exists(path),
		list: async dir => ((await $.fs.exists(dir)) ? await $.fs.list(dir) : undefined),
		readlink: async path => {
			const result = await $.process.run(['readlink', path])
			return result.exitCode === 0 ? result.stdout.trim() : undefined
		},
		link: async (path, target) => {
			const result = await $.process.run(['ln', '-s', target, path])
			if (result.exitCode !== 0) throw new Error(`ln -s failed for ${path}: ${result.stderr.trim()}`)
		},
	}
}

async function recordSetup($: EngineInterface, status: 'done' | 'declined'): Promise<void> {
	await $.store.set(SETUP_KEY, { status, at: new Date(await $.clock.now()).toISOString() })
}

async function resolvePaths($: EngineInterface): Promise<Paths> {
	const home = (await $.env.get('HOME')) ?? ''
	if (home === '') throw new Error('HOME is not set')
	return pathsFor(home, await $.env.get('CLAUDE_CONFIG_DIR'))
}

async function runSetup($: EngineInterface): Promise<string> {
	const paths = await resolvePaths($)
	const io = setupIo($)
	const plan = planSetup(await readSnapshot(io, paths, `${$.plugin.root}/AGENTS.md`), paths)
	if (plan.steps.length === 0) {
		await recordSetup($, 'done')
		return describeNothing(plan)
	}
	const answer = await $.ui.ask(describePlan(plan), { options: [APPLY, SKIP], header: 'Setup' }).catch(() => SKIP)
	if (answer !== APPLY) {
		await recordSetup($, 'declined')
		return 'Setup skipped and nothing changed. Run /studio setup to do it later.'
	}
	const backups = await applyPlan(io, plan)
	await recordSetup($, 'done')
	return describeResult(plan, backups)
}

async function setupCommand($: EngineInterface): Promise<string> {
	try {
		return await runSetup($)
	} catch (error) {
		return `Setup failed: ${error instanceof Error ? error.message : String(error)}`
	}
}

function updateIo($: EngineInterface): UpdateIo {
	return {
		run: argv => $.process.run(argv, { timeoutMs: UPDATE_STEP_TIMEOUT_MS }),
		files: setupIo($),
		setupDone: async () => {
			const record = await $.store.get(SETUP_KEY)
			return typeof record === 'object' && record !== null && 'status' in record && record.status === 'done'
		},
		requestReload: () => {
			$.clock.after(RELOAD_DELAY_MS, async () => {
				try {
					const result = await $.command.run({ command: 'reload-plugins' })
					$.ui.log(result.text ?? 'Reloaded plugins.')
				} catch (error) {
					$.ui.log(`Could not reload plugins: ${error instanceof Error ? error.message : String(error)}`)
				}
			})
		},
		log: text => $.ui.log(text),
	}
}

let updating = false

async function updateStudio($: EngineInterface): Promise<{ ok: boolean; text: string }> {
	if (updating) return { ok: false, text: 'An update is already running.' }
	updating = true
	try {
		return { ok: true, text: await runUpdate(updateIo($), await resolvePaths($)) }
	} catch (error) {
		return { ok: false, text: `Update failed: ${error instanceof Error ? error.message : String(error)}` }
	} finally {
		updating = false
	}
}

type Restriction = { strict: boolean; refusal: string }

async function baseContext($: EngineInterface, strict: boolean): Promise<PolicyContext> {
	const info = await $.session.info()
	return {
		cwd: await $.session.cwd(),
		home: (await $.env.get('HOME')) ?? '',
		scratchpad: info.scratchpadDir,
		strict,
	}
}

async function realPath($: EngineInterface, path: string): Promise<string> {
	let probe = path
	let tail = ''
	while (probe !== '') {
		try {
			const stat = await $.fs.stat(probe, { resolve: true })
			return stat.realPath === undefined ? '/unresolved' : stat.realPath.replace(/\/$/, '') + tail
		} catch {
			const cut = probe.lastIndexOf('/')
			tail = probe.slice(cut) + tail
			probe = probe.slice(0, cut)
		}
	}
	return '/unresolved'
}

async function writesCode(
	$: EngineInterface,
	strict: boolean,
	check: (ctx: PolicyContext) => boolean,
): Promise<boolean> {
	const base = await baseContext($, strict)
	const asked = new Set<string>()
	const first = check({
		...base,
		real: path => {
			asked.add(path)
			return path
		},
	})
	if (first || asked.size === 0) return first
	const known = new Map<string, string>()
	for (const path of asked) known.set(path, await realPath($, path))
	return check({ ...base, real: path => known.get(path) ?? path })
}

async function restriction($: EngineInterface, agentId: string | undefined): Promise<Restriction | undefined> {
	if (agentId === undefined) return (await read($, policyAtom)) ? { strict: false, refusal: REFUSAL } : undefined
	const type = (await $.agent.list()).find(agent => agent.id === agentId)?.type
	const role = type === undefined ? undefined : readOnlyRole(type)
	return role === undefined ? undefined : { strict: true, refusal: readOnlyRefusal(role) }
}

function commandOf(input: unknown): string {
	return typeof input === 'object' && input !== null && 'command' in input && typeof input.command === 'string'
		? input.command
		: ''
}

async function resolveLookup($: EngineInterface, request: Lookup, budgetMs: number): Promise<string | undefined> {
	if (budgetMs <= 0) return undefined
	const argv =
		request.kind === 'branch'
			? ['git', 'branch', '--show-current']
			: [
					'gh',
					'pr',
					'view',
					...(request.selector === '' ? [] : [request.selector]),
					...(request.repo === undefined ? [] : [`--repo=${request.repo}`]),
					'--json',
					'baseRefName',
					'--jq',
					'.baseRefName',
				]
	try {
		const result = await $.process.run(argv, { cwd: request.cwd, timeoutMs: budgetMs })
		const out = result.stdout.trim()
		return result.exitCode === 0 && out !== '' ? out : undefined
	} catch {
		return undefined
	}
}

async function mergesMain($: EngineInterface, command: string): Promise<boolean> {
	const cwd = await $.session.cwd()
	const home = (await $.env.get('HOME')) ?? ''
	const deadline = Date.now() + LOOKUP_BUDGET_MS
	const known = new Map<string, string | undefined>()
	const pending = new Map<string, Lookup>()
	for (;;) {
		pending.clear()
		const verdict = mergesIntoMain(command, {
			cwd,
			home,
			lookup: request => {
				const key = JSON.stringify(request)
				if (known.has(key)) return known.get(key)
				pending.set(key, request)
				return undefined
			},
		})
		if (!verdict || pending.size === 0) return verdict
		for (const [key, request] of pending) known.set(key, await resolveLookup($, request, deadline - Date.now()))
	}
}

export const register: Register = on => {
	on('session.start', async ($, e, next) => {
		await $.command.register({
			name: NAME,
			description: 'Studio 201 commands. ' + USAGE,
		})
		await $.tool.register({ name: UPDATE_TOOL, description: UPDATE_TOOL_DESCRIPTION })
		const started = await next(e)
		if (e.isInteractive && (await $.store.get(SETUP_KEY)) === undefined) {
			$.ui.log(await setupCommand($))
		}
		return started
	})

	on('command.run', { command: NAME }, async ($, e) => {
		const [name = '', ...rest] = e.args.trim().split(/\s+/)
		switch (name) {
			case 'policy':
				return { text: await policyCommand($, rest.join(' ')) }
			case 'setup':
				return { text: await setupCommand($) }
			case 'update':
				return { text: (await updateStudio($)).text }
			default:
				return { text: USAGE }
		}
	}).catch(() => ({ text: 'studio: the command failed.' }))

	on('tool.run', { tool: UPDATE_TOOL_ID }, async $ => {
		const { ok, text } = await updateStudio($)
		return ok ? { result: text } : { deny: text }
	}).catch(() => ({ deny: 'studio_update failed.' }))

	on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
		const rule = await restriction($, e.agentId)
		if (rule === undefined) return next(e)
		if (rule.strict) return { deny: rule.refusal }
		const path = 'notebook_path' in e ? e.notebook_path : e.file_path
		if (!(await writesCode($, false, ctx => isCodePath(path, ctx)))) return next(e)
		return { deny: rule.refusal }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the write is refused.` },
	)

	on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
		const rule = await restriction($, e.agentId)
		if (rule === undefined) return next(e)
		if (!(await writesCode($, rule.strict, ctx => bashWritesCode(e.command, ctx)))) return next(e)
		return { deny: rule.refusal }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the command is refused.` },
	)

	on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
		if (e.agentId === undefined || !(await mergesMain($, e.command))) return next(e)
		return { deny: MERGE_REFUSAL }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${MERGE_REFUSAL} The merge check failed, so the command is refused.` },
	)

	on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
		if (e.agentId !== undefined) return next(e)
		const merges = await mergesMain($, commandOf(e.input))
		const verdict = await next(e)
		if (!merges || verdict.decision === 'deny') return verdict
		return { decision: 'ask', reason: ASK_REASON }
	}).catch(($, e, next) => (next.called ? next(e) : { decision: 'ask', reason: ASK_REASON }))
}

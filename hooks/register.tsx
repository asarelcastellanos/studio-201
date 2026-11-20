import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { NO_BOARD, readBoardUrl } from '../src/board'
import { ASK_REASON, MERGE_REFUSAL, mergesIntoMain } from '../src/merge'
import type { Lookup } from '../src/merge'
import { REFUSAL, bashWritesCode, isCodePath, readOnlyRefusal, readOnlyRole } from '../src/policy'
import type { PolicyContext } from '../src/policy'
import {
	ARCHIVE,
	DELETE,
	SetupFailure,
	applyPlan,
	archiveStamp,
	describeFailure,
	describeNothing,
	describePlan,
	describeResult,
	parentDir,
	pathsFor,
	planSetup,
	readSnapshot,
	sameSnapshot,
} from '../src/setup'
import type { Mode, Paths, SetupIo } from '../src/setup'
import { runUpdate } from '../src/update'
import type { UpdateIo } from '../src/update'

const NAME = 'studio'
const BOARD_NAME = 'board'
const LOOKUP_BUDGET_MS = 20000
const policyAtom = atom({ plugin: 'studio-201', key: 'policy' } as const, true)
const USAGE = 'Usage: /studio policy [on|off], /studio setup or /studio update'
const UPDATE_TOOL = 'studio_update'
const UPDATE_TOOL_ID = 'mcp__studio-201__studio_update'
const UPDATE_ASK_REASON = 'studio-201: this pulls the clone and reinstalls Studio 201. Approve or decline.'
const UPDATE_REFUSAL = 'studio-201 policy: only the main session updates Studio 201, after the owner approves.'
const UPDATE_TOOL_DESCRIPTION =
	'Updates the Studio 201 plugin to the latest version and reports the old and new version. Call it only when the user asks to update, upgrade or get the latest Studio 201. It pulls the local clone of the plugin if there is one, updates the marketplace and the plugin, and refreshes the AGENTS.md copy if setup has run. It takes no input. Give the user its result as it is.'
const SETUP_KEY = 'setup'
const SETUP_LOCK_KEY = 'setup-lock'
const UPDATE_LOCK_KEY = 'update-lock'
const LOCK_TTL_MS = 15 * 60 * 1000
const ASK_ROUNDS = 3
const UPDATE_STEP_TIMEOUT_MS = 120000

async function policyCommand($: EngineInterface, args: string): Promise<string> {
	const arg = args.trim().toLowerCase()
	if (arg === 'on' || arg === 'off') await update($, policyAtom, () => arg === 'on')
	else if (arg !== '') return USAGE
	return (await read($, policyAtom)) ? 'on' : 'off'
}

function setupIo($: EngineInterface): SetupIo {
	const run = async (argv: readonly string[]): Promise<void> => {
		const result = await $.process.run(argv)
		if (result.exitCode !== 0) throw new Error(`${argv[0]} failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`)
	}
	const exists = (path: string): Promise<boolean> => $.fs.exists(path)
	return {
		read: async path => ((await exists(path)) ? await $.fs.read(path) : undefined),
		write: (path, text) => $.fs.write(path, text),
		exists,
		list: async dir => ((await exists(dir)) ? (await $.fs.list(dir)).map(entry => entry.name) : undefined),
		isLink: async path => ((await $.fs.stat(path).catch(() => undefined))?.isLink ?? false),
		readlink: async path => {
			const result = await $.process.run(['readlink', path])
			return result.exitCode === 0 ? result.stdout.trim() : undefined
		},
		link: (path, target) => run(['ln', '-s', target, path]),
		move: async (from, to) => {
			await run(['mkdir', '-p', parentDir(to)])
			await run(['mv', from, to])
		},
		remove: path => run(['rm', '-rf', path]),
		writeAtomic: async (path, text) => {
			const stat = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
			const target = stat?.isLink === true && stat.realPath !== undefined ? stat.realPath : path
			const temp = `${target}.studio-201-tmp`
			await $.fs.write(temp, text)
			try {
				if (stat !== undefined) {
					const mode = await $.process.run(['stat', '-f', '%Lp', target])
					if (mode.exitCode === 0) await run(['chmod', mode.stdout.trim(), temp])
				}
				await run(['mv', '-f', temp, target])
			} catch (error) {
				await $.process.run(['rm', '-f', temp]).catch(() => undefined)
				throw error
			}
		},
	}
}

type Lock = { id: string; at: number }

function isLock(value: unknown): value is Lock {
	return typeof value === 'object' && value !== null && 'id' in value && 'at' in value
}

async function takeLock($: EngineInterface, key: string): Promise<string | undefined> {
	const now = await $.clock.now()
	const held = await $.store.get(key)
	if (isLock(held) && now - held.at < LOCK_TTL_MS) return undefined
	const id = `${now}-${Math.random().toString(36).slice(2)}`
	await $.store.set(key, { id, at: now })
	const check = await $.store.get(key)
	return isLock(check) && check.id === id ? id : undefined
}

async function dropLock($: EngineInterface, key: string, id: string): Promise<void> {
	const held = await $.store.get(key)
	if (isLock(held) && held.id === id) await $.store.delete(key)
}

type Outcome = { text: string; show: boolean }

async function resolvePaths($: EngineInterface): Promise<Paths> {
	const home = (await $.env.get('HOME')) ?? ''
	if (home === '') throw new Error('HOME is not set')
	return pathsFor(home, await $.env.get('CLAUDE_CONFIG_DIR'))
}

async function installSetup($: EngineInterface): Promise<Outcome> {
	const paths = await resolvePaths($)
	const io = setupIo($)
	const sourcePath = `${$.plugin.root}/AGENTS.md`
	let snapshot = await readSnapshot(io, paths, sourcePath)
	for (let round = 0; round < ASK_ROUNDS; round++) {
		const plan = planSetup(snapshot, paths)
		if (plan.blocked !== undefined) return { text: plan.blocked, show: true }
		if (plan.items.length === 0 && plan.steps.length === 0) {
			await recordDone($)
			return { text: describeNothing(plan), show: false }
		}
		let mode: Mode = 'archive'
		let toApply = plan
		if (plan.items.length > 0) {
			const answer = await $.ui
				.ask(describePlan(plan, paths), { options: [ARCHIVE, DELETE], header: 'Old setup' })
				.catch(() => undefined)
			if (answer !== ARCHIVE && answer !== DELETE) {
				return { text: 'Setup was not applied and nothing changed. It asks again next session, or run /studio setup.', show: true }
			}
			mode = answer === ARCHIVE ? 'archive' : 'delete'
			const fresh = await readSnapshot(io, paths, sourcePath)
			if (!sameSnapshot(snapshot, fresh)) {
				snapshot = fresh
				continue
			}
			toApply = planSetup(fresh, paths)
			if (toApply.blocked !== undefined) return { text: toApply.blocked, show: true }
		}
		const applied = await applyPlan(io, paths, toApply, mode, archiveStamp(await $.clock.now()))
		await recordDone($)
		return { text: describeResult(toApply, mode, applied), show: true }
	}
	return { text: 'The files kept changing while setup waited for an answer, so nothing was changed. Run /studio setup again.', show: true }
}

async function recordDone($: EngineInterface): Promise<void> {
	await $.store.set(SETUP_KEY, { status: 'done', at: new Date(await $.clock.now()).toISOString() })
}

async function runSetup($: EngineInterface): Promise<Outcome> {
	const lock = await takeLock($, SETUP_LOCK_KEY)
	if (lock === undefined) return { text: 'Setup is already running in another session.', show: false }
	try {
		return await installSetup($)
	} catch (error) {
		const text = error instanceof SetupFailure ? describeFailure(error) : `Setup failed: ${error instanceof Error ? error.message : String(error)}`
		return { text, show: true }
	} finally {
		await dropLock($, SETUP_LOCK_KEY, lock)
	}
}

async function setupCommand($: EngineInterface): Promise<string> {
	return (await runSetup($)).text
}

function startSetup($: EngineInterface): void {
	void runSetup($)
		.then(outcome => (outcome.show ? $.ui.log(outcome.text) : undefined))
		.catch(() => undefined)
}

function updateIo($: EngineInterface): UpdateIo {
	return {
		run: (argv, env) => $.process.run(argv, { timeoutMs: UPDATE_STEP_TIMEOUT_MS, ...(env === undefined ? {} : { env }) }),
		files: setupIo($),
		setupDone: async () => {
			const record = await $.store.get(SETUP_KEY)
			return typeof record === 'object' && record !== null && 'status' in record && record.status === 'done'
		},
		log: text => $.ui.log(text),
	}
}

let updating = false

async function updateStudio($: EngineInterface): Promise<{ ok: boolean; text: string }> {
	if (updating) return { ok: false, text: 'An update is already running.' }
	updating = true
	let lock: string | undefined
	try {
		lock = await takeLock($, UPDATE_LOCK_KEY)
		if (lock === undefined) return { ok: false, text: 'An update is already running in another session.' }
		return { ok: true, text: await runUpdate(updateIo($), await resolvePaths($)) }
	} catch (error) {
		return { ok: false, text: `Update failed: ${error instanceof Error ? error.message : String(error)}` }
	} finally {
		if (lock !== undefined) await dropLock($, UPDATE_LOCK_KEY, lock).catch(() => undefined)
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
		await $.command.register({
			name: BOARD_NAME,
			description: "Print the link to this product's GitHub board.",
		})
		await $.tool.register({ name: UPDATE_TOOL, description: UPDATE_TOOL_DESCRIPTION })
		const started = await next(e)
		if (e.isInteractive && (await $.store.get(SETUP_KEY)) === undefined) startSetup($)
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

	on('command.run', { command: BOARD_NAME }, async $ => {
		const read = async (path: string): Promise<string | undefined> =>
			(await $.fs.exists(path)) ? await $.fs.read(path) : undefined
		return { text: (await readBoardUrl({ read }, await $.session.cwd())) ?? NO_BOARD }
	}).catch(() => ({ text: NO_BOARD }))

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

	on('tool.check', { tool: UPDATE_TOOL_ID }, async ($, e, next) => {
		if (e.agentId !== undefined) return { decision: 'deny', reason: UPDATE_REFUSAL }
		const verdict = await next(e)
		return verdict.decision === 'deny' ? verdict : { decision: 'ask', reason: UPDATE_ASK_REASON }
	}).catch(($, e, next) =>
		next.called ? next(e) : e.agentId !== undefined ? { decision: 'deny', reason: UPDATE_REFUSAL } : { decision: 'ask', reason: UPDATE_ASK_REASON },
	)

	on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
		if (e.agentId !== undefined) return next(e)
		const merges = await mergesMain($, commandOf(e.input))
		const verdict = await next(e)
		if (!merges || verdict.decision === 'deny') return verdict
		return { decision: 'ask', reason: ASK_REASON }
	}).catch(($, e, next) => (next.called ? next(e) : { decision: 'ask', reason: ASK_REASON }))
}

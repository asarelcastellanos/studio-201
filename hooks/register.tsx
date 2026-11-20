import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { REFUSAL, bashWritesCode, isCodePath } from '../src/policy'
import type { PolicyContext } from '../src/policy'

const NAME = 'studio'
const policyAtom = atom({ plugin: 'studio-201', key: 'policy' } as const, true)
const USAGE = 'Usage: /studio policy [on|off]'

async function policyCommand($: EngineInterface, args: string): Promise<string> {
	const arg = args.trim().toLowerCase()
	if (arg === 'on' || arg === 'off') await update($, policyAtom, () => arg === 'on')
	else if (arg !== '') return USAGE
	return (await read($, policyAtom)) ? 'on' : 'off'
}

async function baseContext($: EngineInterface): Promise<PolicyContext> {
	const info = await $.session.info()
	return {
		cwd: await $.session.cwd(),
		home: (await $.env.get('HOME')) ?? '',
		scratchpad: info.scratchpadDir,
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

async function writesCode($: EngineInterface, check: (ctx: PolicyContext) => boolean): Promise<boolean> {
	const base = await baseContext($)
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

async function restricted($: EngineInterface, agentId: string | undefined): Promise<boolean> {
	return agentId === undefined && (await read($, policyAtom))
}

export const register: Register = on => {
	on('session.start', async ($, e, next) => {
		await $.command.register({
			name: NAME,
			description: 'Studio 201 commands. ' + USAGE,
		})
		return next(e)
	})

	on('command.run', { command: NAME }, async ($, e) => {
		const [name = '', ...rest] = e.args.trim().split(/\s+/)
		switch (name) {
			case 'policy':
				return { text: await policyCommand($, rest.join(' ')) }
			default:
				return { text: USAGE }
		}
	}).catch(() => ({ text: 'studio: the command failed.' }))

	on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
		if (!(await restricted($, e.agentId))) return next(e)
		const path = 'notebook_path' in e ? e.notebook_path : e.file_path
		if (!(await writesCode($, ctx => isCodePath(path, ctx)))) return next(e)
		return { deny: REFUSAL }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the write is refused.` },
	)

	on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
		if (!(await restricted($, e.agentId))) return next(e)
		if (!(await writesCode($, ctx => bashWritesCode(e.command, ctx)))) return next(e)
		return { deny: REFUSAL }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the command is refused.` },
	)
}

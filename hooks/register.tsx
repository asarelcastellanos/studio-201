import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { REFUSAL, bashWritesCode, isCodePath } from '../src/policy'
import type { PolicyContext } from '../src/policy'

const NAME = 'studio'
const policyAtom = atom({ plugin: 'studio-201', key: 'policy' } as const, true)

async function policyCommand($: EngineInterface, args: string): Promise<string> {
	const arg = args.trim().toLowerCase()
	if (arg === 'on' || arg === 'off') await update($, policyAtom, () => arg === 'on')
	else if (arg !== '') return 'Usage: /studio policy [on|off]'
	return (await read($, policyAtom)) ? 'on' : 'off'
}

async function policyContext($: EngineInterface): Promise<PolicyContext> {
	const info = await $.session.info()
	return {
		cwd: await $.session.cwd(),
		home: (await $.env.get('HOME')) ?? '',
		tmpdir: (await $.env.get('TMPDIR')) ?? '',
		scratchpad: info.scratchpadDir,
	}
}

async function restricted($: EngineInterface, agentId: string | undefined): Promise<boolean> {
	return agentId === undefined && (await read($, policyAtom))
}

export const register: Register = on => {
	on('session.start', async ($, e, next) => {
		await $.command.register({
			name: NAME,
			description: 'Studio 201 commands: /studio policy [on|off]',
		})
		return next(e)
	})

	on('command.run', { command: NAME }, async ($, e) => {
		const [name = '', ...rest] = e.args.trim().split(/\s+/)
		switch (name) {
			case 'policy':
				return { text: await policyCommand($, rest.join(' ')) }
			default:
				return { text: 'Usage: /studio policy [on|off]' }
		}
	})

	on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
		if (!(await restricted($, e.agentId))) return next(e)
		const path = 'notebook_path' in e ? e.notebook_path : e.file_path
		if (!isCodePath(path, await policyContext($))) return next(e)
		return { deny: REFUSAL }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the write is refused.` },
	)

	on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
		if (!(await restricted($, e.agentId))) return next(e)
		if (!bashWritesCode(e.command, await policyContext($))) return next(e)
		return { deny: REFUSAL }
	}).catch(($, e, next) =>
		next.called ? next(e) : { deny: `${REFUSAL} The policy check failed, so the command is refused.` },
	)
}

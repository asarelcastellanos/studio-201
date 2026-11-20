import { SHELLS, absolute, invocation, movedTo, parse, valueOf } from './policy'
import type { Invocation } from './policy'

export const ASK_REASON = 'studio-201: this merges into main. Check the review package above, then approve or decline.'

export const MERGE_REFUSAL = 'studio-201 policy: only the main session merges into main, after the owner approves.'

export type Lookup =
	| { kind: 'base'; selector: string; repo?: string; cwd: string }
	| { kind: 'branch'; cwd: string }

export type MergeContext = {
	cwd: string
	home: string
	lookup: (request: Lookup) => string | undefined
}

const MAIN_REF = /^(?:refs\/heads\/)?main$/

const PR_VALUE_FLAGS = ['-R', '--repo', '-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email', '--match-head-commit']

const API_VALUE_FLAGS = ['-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-p', '--preview']

const PUSH_VALUE_FLAGS = ['-o', '--push-option', '--receive-pack', '--exec', '--repo']

const GIT_VALUE_FLAGS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace']

const FIELD_FLAGS = ['-f', '-F', '--raw-field', '--field']

function operandsSkipping(args: readonly string[], valued: readonly string[]): string[] {
	const out: string[] = []
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (arg === '--') {
			out.push(...args.slice(i + 1).filter(rest => rest !== ''))
			break
		}
		if (valued.includes(arg)) i++
		else if (!arg.startsWith('-') && arg !== '') out.push(arg)
	}
	return out
}

function isMain(branch: string | undefined): boolean {
	return branch === undefined || branch === 'main'
}

function ghPrMergesMain(args: readonly string[], ctx: MergeContext): boolean {
	const selector = operandsSkipping(args, PR_VALUE_FLAGS)[0] ?? ''
	const repo = valueOf(args, 'R', 'repo')
	const base = ctx.lookup(
		repo === undefined ? { kind: 'base', selector, cwd: ctx.cwd } : { kind: 'base', selector, repo, cwd: ctx.cwd },
	)
	return isMain(base)
}

function globMatchesMain(pattern: string): boolean {
	const source = pattern
		.split('*')
		.map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*')
	return new RegExp(`^${source}$`).test('refs/heads/main')
}

function refspecUpdatesMain(spec: string, ctx: MergeContext): boolean {
	const bare = spec.replace(/^\+/, '')
	const colon = bare.indexOf(':')
	const destination = colon >= 0 ? bare.slice(colon + 1) : bare
	if (colon < 0 && (destination === 'HEAD' || destination === '@')) {
		return isMain(ctx.lookup({ kind: 'branch', cwd: ctx.cwd }))
	}
	if (MAIN_REF.test(destination)) return true
	return destination.includes('*') && globMatchesMain(destination)
}

function gitPushUpdatesMain(args: readonly string[], ctx: MergeContext): boolean {
	let cwd = ctx.cwd
	let i = 0
	while (i < args.length && (args[i] ?? '').startsWith('-')) {
		if (args[i] === '-C' && args[i + 1] !== undefined) cwd = absolute(args[i + 1] ?? '', { cwd, home: ctx.home })
		i += GIT_VALUE_FLAGS.includes(args[i] ?? '') ? 2 : 1
	}
	if (args[i] !== 'push') return false
	const rest = args.slice(i + 1)
	if (rest.some(arg => arg === '--all' || arg === '--mirror' || arg === '--branches')) return true
	const here = { ...ctx, cwd }
	const operands = operandsSkipping(rest, PUSH_VALUE_FLAGS)
	const refspecs = rest.some(arg => arg === '--repo' || arg.startsWith('--repo=')) ? operands : operands.slice(1)
	if (refspecs.length > 0) return refspecs.some(spec => refspecUpdatesMain(spec, here))
	if (rest.includes('--tags')) return false
	return isMain(here.lookup({ kind: 'branch', cwd }))
}

function fieldsOf(args: readonly string[]): string[] {
	const out: string[] = []
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (FIELD_FLAGS.includes(arg)) out.push(args[++i] ?? '')
		else if (arg.startsWith('--field=')) out.push(arg.slice('--field='.length))
		else if (arg.startsWith('--raw-field=')) out.push(arg.slice('--raw-field='.length))
		else if (/^-[fF]./.test(arg)) out.push(arg.slice(2))
	}
	return out
}

function ghApiUpdatesMain(args: readonly string[]): boolean {
	const fields = fieldsOf(args)
	const sendsBody = fields.length > 0 || args.some(arg => arg === '--input' || arg.startsWith('--input='))
	const method = (valueOf(args, 'X', 'method') ?? (sendsBody ? 'POST' : 'GET')).toUpperCase()
	const endpoint = operandsSkipping(args, API_VALUE_FLAGS)[0] ?? ''
	const path = endpoint
		.replace(/^https?:\/\/[^/]+\//, '')
		.replace(/^\//, '')
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '')
	if (method === 'PUT' && /(?:^|\/)pulls\/[^/]+\/merge$/.test(path)) return true
	if (method === 'POST' && /\/merges$/.test(path) && fields.includes('base=main')) return true
	return ['PATCH', 'POST', 'DELETE'].includes(method) && /\/git\/refs\/heads\/main$/.test(path)
}

function commandMerges(call: Invocation, ctx: MergeContext): boolean {
	const { cmd, args } = call
	if (SHELLS.has(cmd)) {
		const flag = args.findIndex(arg => /^-[A-Za-z]*c$/.test(arg))
		return flag >= 0 && mergesIntoMain(args[flag + 1] ?? '', ctx)
	}
	if (cmd === 'eval') return mergesIntoMain(args.join(' '), ctx)
	if (cmd === 'git') return gitPushUpdatesMain(args, ctx)
	if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'merge') return ghPrMergesMain(args.slice(2), ctx)
	if (cmd === 'gh' && args[0] === 'api') return ghApiUpdatesMain(args.slice(1))
	return false
}

export function mergesIntoMain(command: string, ctx: MergeContext): boolean {
	const { segments, nested } = parse(command)
	if (nested.some(inner => mergesIntoMain(inner, ctx))) return true
	let cwd = ctx.cwd
	for (const segment of segments) {
		const here = { ...ctx, cwd }
		if (commandMerges(invocation(segment.words, segment.fed), here)) return true
		cwd = movedTo(segment.words, here) ?? cwd
	}
	return false
}

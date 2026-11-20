import { SHELLS, absolute, invocation, looksLikeRef, movedTo, parse, valueOf } from './policy'
import type { Invocation } from './policy'

export const ASK_REASON = 'studio-201: this merges into main. Check the review package above, then approve or decline.'

export const MERGE_REFUSAL = 'studio-201 policy: only the main session merges into main, after the owner approves.'

export type Lookup =
	| { kind: 'base'; selector: string; repo?: string; cwd: string }
	| { kind: 'branch'; cwd: string }

export type Tracked = { at: string; name: string | undefined }

export type MergeContext = {
	cwd: string
	home: string
	lookup: (request: Lookup) => string | undefined
	tracked?: Tracked
}

const MAIN_REF = /^(?:(?:refs\/)?heads\/)?main$/

const CURRENT_MARKER = '$%CURRENT%'

const CURRENT_BRANCH_COMMANDS = 'git\\s+(?:branch\\s+--show-current|rev-parse\\s+--abbrev-ref\\s+HEAD)'

const CURRENT_BRANCH_SUBSTITUTION = new RegExp(
	`\\$\\(\\s*${CURRENT_BRANCH_COMMANDS}\\s*\\)|\`\\s*${CURRENT_BRANCH_COMMANDS}\\s*\``,
	'g',
)

const GRAPHQL_WRITES = /\b(?:mergePullRequest|enablePullRequestAutoMerge|updateRef|createCommitOnBranch|updatePullRequestBranch)\b/

const PR_VALUE_FLAGS = ['-R', '--repo', '-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email', '--match-head-commit']

const API_VALUE_FLAGS = ['-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-p', '--preview']

const PUSH_VALUE_FLAGS = ['-o', '--push-option', '--receive-pack', '--exec', '--repo']

const GIT_VALUE_FLAGS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace']

const FIELD_FLAGS = ['-f', '-F', '--raw-field', '--field']

const CREATE_FLAGS = ['-b', '-B', '-c', '-C', '--orphan']

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

function currentBranch(ctx: MergeContext, cwd: string): string | undefined {
	if (ctx.tracked !== undefined && ctx.tracked.at === cwd) return ctx.tracked.name
	return ctx.lookup({ kind: 'branch', cwd })
}

function prBaseIsMain(selector: string, repo: string | undefined, ctx: MergeContext): boolean {
	if (selector.includes('$') || selector.startsWith('-') || repo?.includes('$')) return true
	const base = ctx.lookup(
		repo === undefined ? { kind: 'base', selector, cwd: ctx.cwd } : { kind: 'base', selector, repo, cwd: ctx.cwd },
	)
	return isMain(base)
}

function ghPrMergesMain(call: Invocation, args: readonly string[], ctx: MergeContext): boolean {
	if (args.includes('--disable-auto')) return false
	if (call.viaXargs) return true
	const selector = operandsSkipping(args, PR_VALUE_FLAGS)[0] ?? ''
	return prBaseIsMain(selector, valueOf(args, 'R', 'repo'), ctx)
}

function globMatchesMain(pattern: string): boolean {
	const source = pattern
		.split('*')
		.map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*')
	return new RegExp(`^${source}$`).test('refs/heads/main')
}

function refspecUpdatesMain(spec: string, ctx: MergeContext, cwd: string): boolean {
	let bare = spec.replace(/^\+/, '')
	if (bare.includes(CURRENT_MARKER)) {
		const name = currentBranch(ctx, cwd)
		if (name === undefined) return true
		bare = bare.split(CURRENT_MARKER).join(name)
	}
	const colon = bare.indexOf(':')
	const destination = colon >= 0 ? bare.slice(colon + 1) : bare
	if (destination.includes('$') || destination.includes('`')) return true
	if (colon < 0 && (destination === 'HEAD' || destination === '@')) return isMain(currentBranch(ctx, cwd))
	if (MAIN_REF.test(destination)) return true
	return destination.includes('*') && globMatchesMain(destination)
}

function gitCommand(args: readonly string[], ctx: MergeContext): { sub: string | undefined; rest: string[]; cwd: string } {
	let cwd = ctx.cwd
	let i = 0
	while (i < args.length && (args[i] ?? '').startsWith('-')) {
		if (args[i] === '-C' && args[i + 1] !== undefined) cwd = absolute(args[i + 1] ?? '', { cwd, home: ctx.home })
		i += GIT_VALUE_FLAGS.includes(args[i] ?? '') ? 2 : 1
	}
	return { sub: args[i], rest: args.slice(i + 1), cwd }
}

function gitPushUpdatesMain(call: Invocation, ctx: MergeContext): boolean {
	const { sub, rest, cwd } = gitCommand(call.args, ctx)
	if (sub !== 'push') return false
	if (call.viaXargs) return true
	if (rest.some(arg => arg === '--all' || arg === '--mirror' || arg === '--branches')) return true
	const operands = operandsSkipping(rest, PUSH_VALUE_FLAGS)
	const hasRepo = rest.some(arg => arg === '--repo' || arg.startsWith('--repo='))
	const first = operands[0] ?? ''
	if (!hasRepo && operands.length === 1 && first.includes('$') && first !== CURRENT_MARKER) return true
	const refspecs = hasRepo ? operands : operands.slice(1)
	if (refspecs.length > 0) return refspecs.some(spec => refspecUpdatesMain(spec, ctx, cwd))
	if (rest.includes('--tags')) return false
	return isMain(currentBranch(ctx, cwd))
}

function namesBranch(name: string): boolean {
	return !/[$`~^@]/.test(name) && name !== '-' && !/^(?:origin|upstream)\//.test(name) && !/^[0-9a-f]{7,40}$/.test(name)
}

function switchedTo(call: Invocation, ctx: MergeContext): Tracked | undefined {
	if (call.cmd !== 'git') return undefined
	const { sub, rest, cwd } = gitCommand(call.args, ctx)
	if (sub !== 'checkout' && sub !== 'switch') return undefined
	const dash = rest.indexOf('--')
	if (dash >= 0 && sub === 'checkout') return undefined
	const flags = dash >= 0 ? rest.slice(0, dash) : rest
	const operands: string[] = []
	let created: string | undefined
	let unresolved = false
	for (let i = 0; i < flags.length; i++) {
		const arg = flags[i] ?? ''
		if (CREATE_FLAGS.includes(arg)) created = flags[++i] ?? ''
		else if (['-d', '--detach', '-t', '--track'].includes(arg)) unresolved = true
		else if (arg === '-' || (!arg.startsWith('-') && arg !== '')) operands.push(arg)
	}
	const known = (name: string): Tracked => ({ at: cwd, name: namesBranch(name) ? name : undefined })
	if (created !== undefined) return known(created)
	if (unresolved) return { at: cwd, name: undefined }
	const target = operands[0]
	if (target === undefined) return undefined
	if (sub === 'switch') return known(target)
	if (operands.length > 1 || (target !== '-' && !looksLikeRef(target))) return undefined
	return known(target)
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

function fieldValue(fields: readonly string[], name: string): string | undefined {
	const field = fields.find(entry => entry.startsWith(`${name}=`))
	return field === undefined ? undefined : field.slice(name.length + 1)
}

function graphqlWrites(fields: readonly string[]): boolean {
	const query = fieldValue(fields, 'query')
	if (query === undefined || query.startsWith('@') || query === '$SUB') return true
	return GRAPHQL_WRITES.test(query)
}

function namesMain(value: string | undefined): boolean {
	return value !== undefined && (value.includes('$') || MAIN_REF.test(value))
}

function ghApiUpdatesMain(call: Invocation, args: readonly string[], ctx: MergeContext): boolean {
	const fields = fieldsOf(args)
	const hasInput = args.some(arg => arg === '--input' || arg.startsWith('--input='))
	const method = (valueOf(args, 'X', 'method') ?? (fields.length > 0 || hasInput ? 'POST' : 'GET')).toUpperCase()
	const endpoint = operandsSkipping(args, API_VALUE_FLAGS)[0] ?? ''
	const path = endpoint
		.replace(/^https?:\/\/[^/]+\//, '')
		.replace(/^\//, '')
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '')
	if (path === 'graphql') return graphqlWrites(fields)
	if (method === 'GET') return false
	if (call.viaXargs) return true
	if (method === 'PUT') {
		const merge = /^repos\/([^/]+\/[^/]+)\/pulls\/([^/]+)\/merge$/.exec(path)
		if (merge) return prBaseIsMain(merge[2] ?? '', merge[1], ctx)
		if (/(?:^|\/)pulls\/[^/]+\/merge$/.test(path)) return true
	}
	if ((method === 'PUT' || method === 'DELETE') && /\/contents\//.test(path)) {
		return hasInput || fieldValue(fields, 'branch') === undefined || namesMain(fieldValue(fields, 'branch'))
	}
	if (method === 'POST' && /\/merges$/.test(path)) return hasInput || namesMain(fieldValue(fields, 'base'))
	if (['PATCH', 'POST', 'DELETE'].includes(method) && /\/git\/refs(?:\/|$)/.test(path)) {
		return hasInput || namesMain(path.split('/git/refs/')[1]) || namesMain(fieldValue(fields, 'ref'))
	}
	return false
}

function commandMerges(call: Invocation, ctx: MergeContext): boolean {
	const { cmd, args } = call
	if (SHELLS.has(cmd)) {
		const flag = args.findIndex(arg => /^-[A-Za-z]*c$/.test(arg))
		return flag >= 0 && mergesIntoMain(args[flag + 1] ?? '', ctx)
	}
	if (cmd === 'eval') return args.some(arg => arg.includes('$') || arg.includes('`')) || mergesIntoMain(args.join(' '), ctx)
	if (cmd === 'git') return gitPushUpdatesMain(call, ctx)
	if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'merge') return ghPrMergesMain(call, args.slice(2), ctx)
	if (cmd === 'gh' && args[0] === 'api') return ghApiUpdatesMain(call, args.slice(1), ctx)
	return false
}

export function mergesIntoMain(command: string, ctx: MergeContext): boolean {
	const { segments, nested } = parse(command.replace(CURRENT_BRANCH_SUBSTITUTION, CURRENT_MARKER))
	if (nested.some(inner => mergesIntoMain(inner, ctx))) return true
	let cwd = ctx.cwd
	let tracked = ctx.tracked
	for (const segment of segments) {
		const here: MergeContext = tracked === undefined ? { ...ctx, cwd } : { ...ctx, cwd, tracked }
		const call = invocation(segment.words, segment.fed)
		if (commandMerges(call, here)) return true
		tracked = switchedTo(call, here) ?? tracked
		cwd = movedTo(segment.words, here) ?? cwd
	}
	return false
}

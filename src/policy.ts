export const REFUSAL =
	"studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent."

export type PolicyContext = {
	cwd: string
	home: string
	scratchpad?: string
	strict?: boolean
	real?: (absolute: string) => string
}

type Segment = { words: string[]; targets: string[]; fed: boolean }

type Parsed = { segments: Segment[]; nested: string[] }

type Invocation = { cmd: string; args: string[]; viaXargs: boolean; fed: boolean }

type InterpreterFlags = { short: string; long: readonly string[] }

const READ_ONLY_ROLES = ['scout', 'researcher', 'reviewer', 'design-critic']

const UNKNOWN_CWD = '/unknown-cwd'

const WRAPPERS = new Set(['sudo', 'command', 'exec', 'time', 'nohup', 'xargs', 'env', 'nice', 'timeout', 'stdbuf', 'npx', 'bunx', 'pnpx'])

const VALUE_FLAGS: Record<string, readonly string[]> = {
	sudo: ['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-U', '-D', '-T'],
	nice: ['-n'],
	env: ['-u', '-C', '-S'],
	timeout: ['-k', '-s'],
	stdbuf: ['-i', '-o', '-e'],
	xargs: ['-n', '-I', '-P', '-L', '-d', '-E', '-s', '-a', '-J'],
}

const KEYWORDS = new Set(['if', 'then', 'do', 'else', 'elif', 'while', 'until', '}'])

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

const INTERPRETER_FLAGS: Record<string, InterpreterFlags> = {
	node: { short: 'ep', long: ['--eval', '--print'] },
	bun: { short: 'e', long: ['--eval', '--print'] },
	perl: { short: 'eEi', long: [] },
	ruby: { short: 'e', long: [] },
	php: { short: 'r', long: [] },
}

const PYTHON_FLAGS: InterpreterFlags = { short: 'c', long: [] }

const READ_ONLY_APPLY = ['--check', '--stat', '--numstat', '--summary']

const WRITING_APPLY = ['--apply', '--index', '--3way', '-3', '--reject']

const REF_PREFIXES = ['origin', 'upstream', 'refs', 'issue', 'feature', 'release', 'hotfix', 'bugfix', 'fix', 'chore']

function normalize(path: string, cwd: string): string {
	const slashed = path.replace(/\\/g, '/')
	const joined = slashed.startsWith('/') ? slashed : `${cwd.replace(/\\/g, '/')}/${slashed}`
	const out: string[] = []
	for (const part of joined.split('/')) {
		if (part === '' || part === '.') continue
		if (part === '..') out.pop()
		else out.push(part)
	}
	return '/' + out.join('/')
}

export function readOnlyRole(agentType: string): string | undefined {
	const role = agentType.startsWith('studio-201:') ? agentType.slice('studio-201:'.length) : undefined
	return role !== undefined && READ_ONLY_ROLES.includes(role) ? role : undefined
}

export function readOnlyRefusal(role: string): string {
	return `studio-201 policy: ${role} is read-only. Report what to change instead.`
}

function isMarkdown(path: string, ctx: PolicyContext): boolean {
	return !ctx.strict && path.toLowerCase().endsWith('.md')
}

function inside(abs: string, root: string): boolean {
	return abs === root || abs.startsWith(root + '/')
}

function absolute(path: string, ctx: PolicyContext): string {
	const expanded = ctx.home && /^~(?:\/|$)/.test(path) ? ctx.home + path.slice(1) : path
	return normalize(expanded, ctx.cwd)
}

function inScratchpad(abs: string, ctx: PolicyContext): boolean {
	if (!ctx.scratchpad) return false
	const root = normalize(ctx.scratchpad, '/')
	if (!inside(abs, root)) return false
	const real = ctx.real ?? ((path: string) => path)
	return inside(real(abs), real(root))
}

export function isCodePath(path: string, ctx: PolicyContext): boolean {
	const abs = absolute(path, ctx)
	if (abs.startsWith('/dev/')) return false
	if (isMarkdown(abs, ctx)) return false
	return !inScratchpad(abs, ctx)
}

function targetIsCode(raw: string, ctx: PolicyContext): boolean {
	return /[$`]/.test(raw) || isCodePath(raw, ctx)
}

function closingParen(text: string, open: number): number {
	let depth = 0
	let i = open
	while (i < text.length) {
		const c = text[i]
		if (c === '\\') i += 2
		else if (c === "'") {
			const j = text.indexOf("'", i + 1)
			i = j < 0 ? text.length : j + 1
		} else if (c === '"') {
			i++
			while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
			i++
		} else {
			if (c === '(') depth++
			else if (c === ')' && --depth === 0) return i
			i++
		}
	}
	return text.length
}

function parse(command: string): Parsed {
	const segments: Segment[] = []
	const nested: string[] = []
	const heredocs: string[] = []
	const n = command.length
	let words: string[] = []
	let targets: string[] = []
	let word = ''
	let hasWord = false
	let fed = false
	let pending: 'target' | 'skip' | undefined
	let i = 0

	const endWord = () => {
		if (!hasWord) return
		if (pending === 'target') targets.push(word)
		else if (pending === undefined) words.push(word)
		pending = undefined
		word = ''
		hasWord = false
	}
	const endSegment = () => {
		endWord()
		pending = undefined
		if (words.length > 0 || targets.length > 0) segments.push({ words, targets, fed })
		words = []
		targets = []
		fed = false
	}
	const dropFd = () => {
		if (hasWord && /^\d+$/.test(word)) {
			word = ''
			hasWord = false
		} else endWord()
	}
	const atCommandStart = () => !hasWord && words.every(w => KEYWORDS.has(w))
	const substitution = (open: number): number => {
		const close = closingParen(command, open)
		nested.push(command.slice(open + 1, close))
		word += '$SUB'
		hasWord = true
		return close + 1
	}
	const backtick = (open: number): number => {
		let close = open + 1
		while (close < n && command[close] !== '`') close += command[close] === '\\' ? 2 : 1
		nested.push(command.slice(open + 1, close))
		word += '$SUB'
		hasWord = true
		return close + 1
	}

	while (i < n) {
		const c = command[i] ?? ''
		if (c === '\\') {
			if (command[i + 1] === '\n') i += 2
			else {
				word += command[i + 1] ?? ''
				hasWord = true
				i += 2
			}
		} else if (c === "'") {
			const j = command.indexOf("'", i + 1)
			const end = j < 0 ? n : j
			word += command.slice(i + 1, end)
			hasWord = true
			i = end + 1
		} else if (c === '"') {
			hasWord = true
			i++
			while (i < n && command[i] !== '"') {
				if (command[i] === '\\') {
					word += command[i + 1] ?? ''
					i += 2
				} else if (command.startsWith('$((', i)) {
					const j = command.indexOf('))', i + 3)
					word += '$ARITH'
					i = j < 0 ? n : j + 2
				} else if (command.startsWith('$(', i)) i = substitution(i + 1)
				else if (command[i] === '`') i = backtick(i)
				else word += command[i++]
			}
			i++
		} else if (command.startsWith('$((', i)) {
			const j = command.indexOf('))', i + 3)
			word += '$ARITH'
			hasWord = true
			i = j < 0 ? n : j + 2
		} else if (command.startsWith('$(', i)) i = substitution(i + 1)
		else if (command.startsWith('${', i)) {
			const j = command.indexOf('}', i)
			const end = j < 0 ? n : j + 1
			word += command.slice(i, end)
			hasWord = true
			i = end
		} else if (c === '`') i = backtick(i)
		else if (c === '#' && !hasWord) {
			const j = command.indexOf('\n', i)
			i = j < 0 ? n : j
		} else if (command.startsWith('[[', i) && atCommandStart() && /\s/.test(command[i + 2] ?? '')) {
			const j = command.indexOf(']]', i + 2)
			i = j < 0 ? n : j + 2
		} else if (command.startsWith('((', i) && atCommandStart()) {
			const j = command.indexOf('))', i + 2)
			i = j < 0 ? n : j + 2
		} else if (c === ' ' || c === '\t') {
			endWord()
			i++
		} else if (c === '\n') {
			endSegment()
			i++
			for (const delimiter of heredocs.splice(0)) {
				while (i < n) {
					const j = command.indexOf('\n', i)
					const line = command.slice(i, j < 0 ? n : j)
					i = j < 0 ? n : j + 1
					if (line.trim() === delimiter) break
				}
			}
		} else if (c === ';' || c === '(' || c === ')') {
			endSegment()
			i++
		} else if (c === '|') {
			endSegment()
			const double = command[i + 1] === '|'
			i += double || command[i + 1] === '&' ? 2 : 1
			fed = !double
		} else if (c === '&' && command[i + 1] === '>') {
			endWord()
			i += command[i + 2] === '>' ? 3 : 2
			pending = 'target'
		} else if (c === '&') {
			endSegment()
			i += command[i + 1] === '&' ? 2 : 1
		} else if (c === '>') {
			dropFd()
			if (command[i + 1] === '(') i = substitution(i + 1)
			else {
				i += command[i + 1] === '>' || command[i + 1] === '|' ? 2 : 1
				if (command[i] === '&') {
					i++
					pending = /^[ \t]*(?:\d+|-)(?![\w./])/.test(command.slice(i)) ? 'skip' : 'target'
				} else pending = 'target'
			}
		} else if (c === '<') {
			if (command.startsWith('<<<', i)) {
				dropFd()
				fed = true
				i += 3
				pending = 'skip'
			} else if (command.startsWith('<<', i)) {
				dropFd()
				fed = true
				const rest = command.slice(i + 2)
				const match = /^-?[ \t]*(?:'([^']*)'|"([^"]*)"|\\?(\w+))/.exec(rest)
				const delimiter = match?.[1] ?? match?.[2] ?? match?.[3]
				if (match && delimiter !== undefined) heredocs.push(delimiter)
				i += 2 + (match ? match[0].length : 0)
			} else if (command[i + 1] === '(') i = substitution(i + 1)
			else {
				dropFd()
				fed = true
				i++
				pending = 'skip'
			}
		} else {
			word += c
			hasWord = true
			i++
		}
	}
	endSegment()
	return { segments, nested }
}

function operandsOf(args: readonly string[]): string[] {
	return args.filter(arg => arg !== '' && !arg.startsWith('-'))
}

function has(args: readonly string[], ...names: string[]): boolean {
	return args.some(arg => names.some(name => arg === name || arg.startsWith(`${name}=`)))
}

function valueOf(args: readonly string[], short: string | undefined, long: string | undefined): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (long !== undefined && arg === `--${long}`) return args[i + 1]
		if (long !== undefined && arg.startsWith(`--${long}=`)) return arg.slice(long.length + 3)
		if (short !== undefined && arg.startsWith('-') && !arg.startsWith('--')) {
			const at = arg.indexOf(short, 1)
			if (at > 0) return arg.slice(at + 1) || args[i + 1]
		}
	}
	return undefined
}

function clusterHas(arg: string, letters: string): boolean {
	if (!/^-[^-]/.test(arg)) return false
	const cluster = arg.slice(1).split(/[MmId]/)[0] ?? ''
	return [...letters].some(letter => cluster.includes(letter))
}

function invocation(words: readonly string[], fed: boolean): Invocation {
	let at = 0
	let viaXargs = false
	while (at < words.length) {
		const word = (words[at] ?? '').replace(/^[{!]+/, '')
		const name = word.split('/').pop() ?? ''
		if (word === '' || KEYWORDS.has(word) || /^\w+=/.test(word)) {
			at++
			continue
		}
		if (!WRAPPERS.has(name)) break
		if (name === 'xargs') viaXargs = true
		const valued = VALUE_FLAGS[name] ?? []
		at++
		while ((words[at] ?? '').startsWith('-')) at += valued.includes(words[at] ?? '') ? 2 : 1
		if (name === 'timeout') at++
	}
	return { cmd: (words[at] ?? '').split('/').pop() ?? '', args: words.slice(at + 1), viaXargs, fed }
}

function destinationWrites(args: readonly string[], ctx: PolicyContext, removesSources: boolean): boolean {
	const plain: string[] = []
	let directory: string | undefined
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (arg === '-t' || arg === '--target-directory') directory = args[++i]
		else if (arg.startsWith('--target-directory=')) directory = arg.slice('--target-directory='.length)
		else if (!arg.startsWith('-') && arg !== '') plain.push(arg)
	}
	const to = directory ?? (plain.length >= 2 ? plain[plain.length - 1] : undefined)
	if (to === undefined) return false
	const sources = directory === undefined ? plain.slice(0, -1) : plain
	const toIsDirectory = directory !== undefined || /(?:^|\/)(?:\.{1,2})?$/.test(to)
	if (removesSources && sources.some(source => targetIsCode(source, ctx))) return true
	if (!toIsDirectory) return targetIsCode(to, ctx)
	return targetIsCode(to, ctx) && sources.some(source => !isMarkdown(source, ctx))
}

function inPlaceWrites(args: readonly string[], ctx: PolicyContext): boolean {
	if (!args.some(arg => /^(?:-[A-Za-z]*i.*|--in-place(?:=.*)?)$/.test(arg))) return false
	const plain: string[] = []
	let scripted = false
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (/^-[A-Za-z]*[efEF]$/.test(arg) || arg === '--expression' || arg === '--file') {
			scripted = true
			i++
		} else if (/^-[ef]./.test(arg) || arg.startsWith('--expression=') || arg.startsWith('--file=')) scripted = true
		else if (!arg.startsWith('-') && arg !== '') plain.push(arg)
	}
	const files = scripted ? plain : plain.slice(1)
	return files.some(file => targetIsCode(file, ctx))
}

function sedWritesFile(args: readonly string[], ctx: PolicyContext): boolean {
	const pattern = /(?:\/[gpiImeM0-9]*|^|[;{}\n!0-9$,])\s*w\s+(\S+)/g
	return args.some(arg => {
		if (arg.startsWith('-') && !arg.startsWith('--expression=')) return false
		return [...arg.matchAll(pattern)].some(match => targetIsCode(match[1] ?? '', ctx))
	})
}

function downloadWrites(cmd: string, args: readonly string[], ctx: PolicyContext): boolean {
	if (cmd === 'curl') {
		const out = valueOf(args, 'o', 'output')
		if (out !== undefined) return out !== '-' && targetIsCode(out, ctx)
		const remoteName = args.some(arg => arg === '--remote-name' || arg === '--remote-name-all' || /^-[A-Za-z]*O$/.test(arg))
		return remoteName && targetIsCode(valueOf(args, undefined, 'output-dir') ?? '.', ctx)
	}
	if (cmd === 'wget') {
		const out = valueOf(args, 'O', 'output-document')
		if (out !== undefined) return out !== '-' && targetIsCode(out, ctx)
		if (args.includes('--spider')) return false
		return targetIsCode(valueOf(args, 'P', 'directory-prefix') ?? '.', ctx)
	}
	if (cmd === 'tar') {
		const extracting = args.some(
			(arg, index) => arg === '--extract' || arg === '--get' || /^-[A-Za-z]*x/.test(arg) || (index === 0 && /^[A-Za-z]*x[A-Za-z]*$/.test(arg)),
		)
		return extracting && targetIsCode(valueOf(args, 'C', 'directory') ?? '.', ctx)
	}
	if (cmd === 'unzip') {
		if (args.some(arg => /^-[A-Za-z]*[lptvZ][A-Za-z]*$/.test(arg))) return false
		return targetIsCode(valueOf(args, 'd', undefined) ?? '.', ctx)
	}
	if (args.some(arg => arg === '--dry-run' || /^-[A-Za-z]*n[A-Za-z]*$/.test(arg))) return false
	const operands = operandsOf(args)
	return operands.length >= 2 && targetIsCode(operands[operands.length - 1] ?? '', ctx)
}

const FIXERS: Record<string, (args: readonly string[]) => boolean> = {
	prettier: args => has(args, '--write', '-w'),
	eslint: args => has(args, '--fix'),
	biome: args => has(args, '--write', '--apply', '--fix'),
	gofmt: args => has(args, '-w'),
	shfmt: args => has(args, '-w'),
	ruff: args => has(args, '--fix') || (args[0] === 'format' && !has(args, '--check', '--diff')),
	black: args => !has(args, '--check', '--diff'),
	rustfmt: args => !has(args, '--check'),
	cargo: args => (args[0] === 'fmt' && !has(args, '--check')) || has(args, '--fix'),
}

function looksLikeRef(operand: string): boolean {
	if (operand === '.' || operand.startsWith(':') || operand.startsWith('/') || operand.startsWith('~')) return false
	if (/\.[A-Za-z][A-Za-z0-9]*$/.test(operand)) return false
	if (operand.includes('/')) return REF_PREFIXES.includes(operand.split('/')[0] ?? '')
	return true
}

function gitWrites(args: readonly string[], ctx: PolicyContext): boolean {
	let i = 0
	while (i < args.length && (args[i] ?? '').startsWith('-')) {
		i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i] ?? '') ? 2 : 1
	}
	const sub = args[i]
	const rest = args.slice(i + 1)
	if (sub === 'apply') return has(rest, ...WRITING_APPLY) || !has(rest, ...READ_ONLY_APPLY)
	if (sub === 'mv') return destinationWrites(rest, ctx, true)
	if (sub === 'rm') {
		if (has(rest, '--cached', '-n', '--dry-run')) return false
		return operandsOf(rest).some(path => targetIsCode(path, ctx))
	}
	if (sub === 'restore') {
		if (has(rest, '--staged', '-S') && !has(rest, '--worktree', '-W')) return false
		const paths: string[] = []
		for (let j = 0; j < rest.length; j++) {
			const arg = rest[j] ?? ''
			if (arg === '-s' || arg === '--source') j++
			else if (!arg.startsWith('-') && arg !== '') paths.push(arg)
		}
		return paths.some(path => targetIsCode(path, ctx))
	}
	if (sub === 'checkout') {
		if (has(rest, '--ours', '--theirs', '--merge', '-m', '-f', '--force', '-p', '--patch')) return true
		const dash = rest.indexOf('--')
		if (dash >= 0) return operandsOf(rest.slice(dash + 1)).some(path => targetIsCode(path, ctx))
		const branching = rest.some(arg => /^-[A-Za-z]*[bB]$/.test(arg)) || has(rest, '--orphan', '--track', '-t', '--detach')
		if (branching) return false
		return operandsOf(rest).some(operand => !looksLikeRef(operand))
	}
	if (sub === 'switch') return has(rest, '-f', '--force', '--discard-changes')
	if (sub === 'stash') return rest[0] === 'pop' || rest[0] === 'apply'
	if (sub === 'reset') return has(rest, '--hard', '--merge', '--keep')
	if (sub === 'clean') {
		const dryRun = has(rest, '--dry-run') || rest.some(arg => /^-[A-Za-z]*n[A-Za-z]*$/.test(arg))
		return !dryRun && rest.some(arg => arg === '--force' || /^-[A-Za-z]*f/.test(arg))
	}
	return false
}

function findWrites(args: readonly string[], ctx: PolicyContext): boolean {
	const starts: string[] = []
	for (const arg of args) {
		if (arg.startsWith('-') || arg === '(' || arg === '!') break
		starts.push(arg)
	}
	if (starts.length === 0) starts.push('.')
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? ''
		if (arg === '-delete' && starts.some(start => targetIsCode(start, ctx))) return true
		if (/^-(?:fprint|fprint0|fprintf|fls)$/.test(arg)) {
			const target = args[i + 1]
			if (target !== undefined && targetIsCode(target, ctx)) return true
		}
		if (!/^-(?:exec|execdir|ok|okdir)$/.test(arg)) continue
		const inner: string[] = []
		for (i++; i < args.length && !/^(?:\\?;|\+)$/.test(args[i] ?? ''); i++) inner.push(args[i] ?? '')
		for (const start of starts) {
			const words = inner.map(word => word.replace(/\{\}/g, start))
			if (segmentWrites({ words, targets: [], fed: false }, ctx)) return true
		}
	}
	return false
}

function interpreterWrites(call: Invocation): boolean | undefined {
	const { cmd, args, fed } = call
	if (cmd === 'deno') return args[0] === 'eval'
	const flags = /^python[\d.]*$/.test(cmd) ? PYTHON_FLAGS : INTERPRETER_FLAGS[cmd]
	if (flags === undefined) return undefined
	const inline = args.some(arg => clusterHas(arg, flags.short) || flags.long.some(name => has([arg], name)))
	return inline || args.includes('-') || (fed && operandsOf(args).length === 0)
}

function commandWrites(call: Invocation, ctx: PolicyContext): boolean {
	const { cmd, args, viaXargs, fed } = call
	if (SHELLS.has(cmd)) {
		const flag = args.findIndex(arg => /^-[A-Za-z]*c$/.test(arg))
		if (flag >= 0) return bashWritesCode(args[flag + 1] ?? '', ctx)
		return args.includes('-') || (fed && operandsOf(args).length === 0)
	}
	const interpreted = interpreterWrites(call)
	if (interpreted !== undefined) return interpreted
	if (cmd === 'eval') return bashWritesCode(args.join(' '), ctx)
	if (cmd === 'find') return findWrites(args, ctx)
	if (cmd === 'awk' || cmd === 'gawk' || cmd === 'mawk' || cmd === 'nawk') {
		return args.some(arg => arg.includes('>') || arg === 'inplace')
	}
	if (cmd === 'sed') return inPlaceWrites(args, ctx) || sedWritesFile(args, ctx)
	if (cmd === 'sort') {
		const out = valueOf(args, 'o', 'output')
		return out !== undefined && targetIsCode(out, ctx)
	}
	if (cmd === 'patch') return !args.includes('--dry-run')
	if (cmd === 'tee') return operandsOf(args).some(target => targetIsCode(target, ctx))
	if (cmd === 'cp' || cmd === 'install' || cmd === 'ln') return destinationWrites(args, ctx, false)
	if (cmd === 'mv') return destinationWrites(args, ctx, true)
	if (cmd === 'dd') return args.some(arg => arg.startsWith('of=') && targetIsCode(arg.slice(3), ctx))
	if (cmd === 'git') return gitWrites(args, ctx)
	if (['curl', 'wget', 'tar', 'unzip', 'rsync'].includes(cmd)) return downloadWrites(cmd, args, ctx)
	if (cmd === 'touch' || cmd === 'rm' || cmd === 'unlink') return operandsOf(args).some(path => targetIsCode(path, ctx))
	if (cmd === 'chmod') return viaXargs
	if (cmd === 'truncate') {
		const files: string[] = []
		for (let i = 0; i < args.length; i++) {
			const arg = args[i] ?? ''
			if (arg === '-s' || arg === '-r' || arg === '--size' || arg === '--reference') i++
			else if (!arg.startsWith('-') && arg !== '') files.push(arg)
		}
		return files.some(path => targetIsCode(path, ctx))
	}
	const fixer = FIXERS[cmd]
	return fixer !== undefined && fixer(args)
}

function segmentWrites(segment: Segment, ctx: PolicyContext): boolean {
	if (segment.targets.some(target => targetIsCode(target, ctx))) return true
	const call = invocation(segment.words, segment.fed)
	if (!call.viaXargs) return commandWrites(call, ctx)
	const copies = ['mv', 'cp', 'install', 'ln'].includes(call.cmd) ? 2 : 1
	return commandWrites({ ...call, args: [...call.args, ...Array<string>(copies).fill('$XARGS')] }, ctx)
}

function movedTo(words: readonly string[], ctx: PolicyContext): string | undefined {
	const { cmd, args } = invocation(words, false)
	if (cmd !== 'cd' && cmd !== 'pushd') return undefined
	const target = operandsOf(args)[0]
	if (target === undefined) return ctx.home || UNKNOWN_CWD
	if (/[$`]/.test(target)) return UNKNOWN_CWD
	return absolute(target, ctx)
}

export function bashWritesCode(command: string, ctx: PolicyContext): boolean {
	const { segments, nested } = parse(command)
	if (nested.some(inner => bashWritesCode(inner, ctx))) return true
	let cwd = ctx.cwd
	for (const segment of segments) {
		const here = { ...ctx, cwd }
		if (segmentWrites(segment, here)) return true
		cwd = movedTo(segment.words, here) ?? cwd
	}
	return false
}

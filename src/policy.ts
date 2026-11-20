export const REFUSAL =
	"studio-201 policy: the main session doesn't edit code. Send this to a coder or mechanic agent."

export type PolicyContext = {
	cwd: string
	home: string
	tmpdir: string
	scratchpad?: string
}

type Segment = { words: string[]; targets: string[] }

type Parsed = { segments: Segment[]; nested: string[] }

const TEMP_ROOTS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

const WRAPPERS = new Set(['sudo', 'command', 'exec', 'time', 'nohup', 'xargs', 'env', 'nice'])

const KEYWORDS = new Set(['if', 'then', 'do', 'else', 'elif', 'while', 'until', '{', '}', '!'])

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])

const READ_ONLY_APPLY = new Set(['--check', '--stat', '--numstat', '--summary'])

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

function inside(abs: string, root: string): boolean {
	return abs === root || abs.startsWith(root + '/')
}

function tempRoots(ctx: PolicyContext): string[] {
	const roots = [...TEMP_ROOTS]
	if (ctx.tmpdir && ctx.tmpdir !== '/') roots.push(normalize(ctx.tmpdir, '/'))
	if (ctx.scratchpad) roots.push(normalize(ctx.scratchpad, '/'))
	return roots
}

export function isCodePath(path: string, ctx: PolicyContext): boolean {
	const expanded = ctx.home && /^~(?:\/|$)/.test(path) ? ctx.home + path.slice(1) : path
	const abs = normalize(expanded, ctx.cwd)
	if (abs.toLowerCase().endsWith('.md')) return false
	return !tempRoots(ctx).some(root => inside(abs, root))
}

function targetIsCode(raw: string, ctx: PolicyContext): boolean {
	if (raw.startsWith('/dev/')) return false
	const target = raw.replace(/^\$(?:TMPDIR|\{TMPDIR\})(?=\/|$)/, ctx.tmpdir || '/tmp')
	if (/[$`]/.test(target)) return true
	return isCodePath(target, ctx)
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
		if (words.length > 0 || targets.length > 0) segments.push({ words, targets })
		words = []
		targets = []
	}
	const dropFd = () => {
		if (hasWord && /^\d+$/.test(word)) {
			word = ''
			hasWord = false
		} else endWord()
	}
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
		else if (c === '`') i = backtick(i)
		else if (c === '#' && !hasWord) {
			const j = command.indexOf('\n', i)
			i = j < 0 ? n : j
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
			i += command[i + 1] === '|' || command[i + 1] === '&' ? 2 : 1
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
				i += 3
				pending = 'skip'
			} else if (command.startsWith('<<', i)) {
				dropFd()
				const rest = command.slice(i + 2)
				const match = /^-?[ \t]*(?:'([^']*)'|"([^"]*)"|\\?(\w+))/.exec(rest)
				const delimiter = match?.[1] ?? match?.[2] ?? match?.[3]
				if (match && delimiter !== undefined) heredocs.push(delimiter)
				i += 2 + (match ? match[0].length : 0)
			} else if (command[i + 1] === '(') i = substitution(i + 1)
			else {
				dropFd()
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
	return targetIsCode(to, ctx) && sources.some(source => !source.toLowerCase().endsWith('.md'))
}

function inPlaceWrites(args: readonly string[], ctx: PolicyContext, flag: RegExp): boolean {
	if (!args.some(arg => flag.test(arg))) return false
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
	const operands = operandsOf(args)
	if (args.some(arg => arg === '--dry-run' || /^-[A-Za-z]*n[A-Za-z]*$/.test(arg))) return false
	return operands.length >= 2 && targetIsCode(operands[operands.length - 1] ?? '', ctx)
}

function gitWrites(args: readonly string[], ctx: PolicyContext): boolean {
	let i = 0
	while (i < args.length && (args[i] ?? '').startsWith('-')) {
		i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i] ?? '') ? 2 : 1
	}
	const sub = args[i]
	const rest = args.slice(i + 1)
	if (sub === 'apply') return !rest.some(arg => READ_ONLY_APPLY.has(arg))
	if (sub === 'mv') return destinationWrites(rest, ctx, true)
	if (sub === 'rm') return operandsOf(rest).some(path => targetIsCode(path, ctx))
	if (sub === 'restore') {
		const worktree = rest.some(arg => arg === '--worktree' || arg === '-W')
		const staged = rest.some(arg => arg === '--staged' || arg === '-S')
		if (staged && !worktree) return false
		const paths: string[] = []
		for (let j = 0; j < rest.length; j++) {
			const arg = rest[j] ?? ''
			if (arg === '-s' || arg === '--source') j++
			else if (!arg.startsWith('-') && arg !== '') paths.push(arg)
		}
		return paths.some(path => targetIsCode(path, ctx))
	}
	if (sub === 'checkout') {
		const dash = rest.indexOf('--')
		if (dash >= 0) return operandsOf(rest.slice(dash + 1)).some(path => targetIsCode(path, ctx))
		const operands = operandsOf(rest)
		const branching = rest.some(arg => /^-[A-Za-z]*[bB]/.test(arg) || arg === '--orphan')
		if (branching) return false
		if (operands.length >= 2) return operands.slice(1).some(path => targetIsCode(path, ctx))
		return operands[0] === '.'
	}
	return false
}

function segmentWrites(segment: Segment, ctx: PolicyContext): boolean {
	if (segment.targets.some(target => targetIsCode(target, ctx))) return true
	const { words } = segment
	let at = 0
	for (; at < words.length; at++) {
		const word = (words[at] ?? '').replace(/^[{!]+/, '')
		if (word === '' || KEYWORDS.has(word) || /^\w+=\S*$/.test(word)) continue
		if (WRAPPERS.has(word)) {
			while ((words[at + 1] ?? '').startsWith('-')) at++
			continue
		}
		break
	}
	const cmd = (words[at] ?? '').split('/').pop() ?? ''
	const args = words.slice(at + 1)

	if (SHELLS.has(cmd)) {
		const flag = args.findIndex(arg => /^-[A-Za-z]*c$/.test(arg))
		return flag >= 0 && bashWritesCode(args[flag + 1] ?? '', ctx)
	}
	if (cmd === 'eval') return bashWritesCode(args.join(' '), ctx)
	if (cmd === 'find') {
		for (let i = 0; i < args.length; i++) {
			if (!/^-(?:exec|execdir|ok|okdir)$/.test(args[i] ?? '')) continue
			const inner: string[] = []
			for (i++; i < args.length && !/^(?:\\?;|\+)$/.test(args[i] ?? ''); i++) inner.push(args[i] ?? '')
			if (segmentWrites({ words: inner, targets: [] }, ctx)) return true
		}
		return false
	}
	if (cmd === 'sed') return inPlaceWrites(args, ctx, /^(?:-[A-Za-z]*i.*|--in-place(?:=.*)?)$/)
	if (cmd === 'perl') return inPlaceWrites(args, ctx, /^-[pnalwWsStTuUc]*i\S*$/)
	if (cmd === 'patch') return !args.includes('--dry-run')
	if (cmd === 'tee') return operandsOf(args).some(target => targetIsCode(target, ctx))
	if (cmd === 'cp' || cmd === 'install' || cmd === 'ln') return destinationWrites(args, ctx, false)
	if (cmd === 'mv') return destinationWrites(args, ctx, true)
	if (cmd === 'dd') return args.some(arg => arg.startsWith('of=') && targetIsCode(arg.slice(3), ctx))
	if (cmd === 'git') return gitWrites(args, ctx)
	if (['curl', 'wget', 'tar', 'unzip', 'rsync'].includes(cmd)) return downloadWrites(cmd, args, ctx)
	if (cmd === 'touch' || cmd === 'rm' || cmd === 'unlink') return operandsOf(args).some(path => targetIsCode(path, ctx))
	if (cmd === 'truncate') {
		const files: string[] = []
		for (let i = 0; i < args.length; i++) {
			const arg = args[i] ?? ''
			if (arg === '-s' || arg === '-r' || arg === '--size' || arg === '--reference') i++
			else if (!arg.startsWith('-') && arg !== '') files.push(arg)
		}
		return files.some(path => targetIsCode(path, ctx))
	}
	return false
}

export function bashWritesCode(command: string, ctx: PolicyContext): boolean {
	const { segments, nested } = parse(command)
	return nested.some(inner => bashWritesCode(inner, ctx)) || segments.some(segment => segmentWrites(segment, ctx))
}

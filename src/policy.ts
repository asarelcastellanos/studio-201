import type { EngineInterface, On, ToolCallInput } from 'claude-code'

type Engine = Pick<EngineInterface, 'env' | 'process'>

const DELEGATE = 'The main session writes only notes, plans and temp files. Delegate this to an agent.'
const OWNER_ONLY = 'Only the owner merges into main.'
const UNREADABLE = `Couldn't check which branch this merges into. ${OWNER_ONLY}`

const PREFIX_WORDS = new Set(['time', 'env', 'command'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const MERGE_VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-A', '--author-email'])
const PULL_MERGE = /(?:^|\/)(?:repos\/([^/]+\/[^/]+)\/)?pulls\/(\d+)\/merge$/

const normalize = (path: string) => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '' && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

const canonical = (path: string) => normalize(path).replace(/^\/private(?=\/)/, '')

const isUnder = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

const isAllowedPath = async ($: Engine, path: string) => {
  const home = await $.env.get('HOME')
  const tmp = await $.env.get('TMPDIR')
  const target = canonical(path)
  const roots = ['/tmp']
  if (tmp !== undefined) roots.push(canonical(tmp))
  if (home !== undefined) roots.push(`${canonical(home)}/.claude/plans`)
  if (roots.some(root => root !== '/' && isUnder(target, root))) return true
  if (home === undefined) return false
  const projects = `${canonical(home)}/.claude/projects/`
  const [project, folder, ...file] = target.startsWith(projects) ? target.slice(projects.length).split('/') : []
  return project !== undefined && folder === 'memory' && file.length > 0
}

const splitCommands = (input: string) => {
  const commands: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let quote = ''
  let escaped = false

  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push(words)
    words = []
  }

  for (const char of input) {
    if (escaped) {
      escaped = false
      if (char !== '\n') {
        word += char
        inWord = true
      }
    } else if (char === '\\' && quote !== "'") {
      escaped = true
    } else if (quote !== '') {
      if (char === quote) quote = ''
      else word += char
    } else if (char === '"' || char === "'") {
      quote = char
      inWord = true
    } else if (char === ';' || char === '&' || char === '|' || char === '\n') {
      endCommand()
    } else if (char === ' ' || char === '\t') {
      endWord()
    } else {
      word += char
      inWord = true
    }
  }
  endCommand()

  return commands
}

const skipPrefixes = (words: string[]) => {
  const start = words.findIndex(word => !PREFIX_WORDS.has(word) && !ASSIGNMENT.test(word))
  return start === -1 ? [] : words.slice(start)
}

const skipGitOptions = (args: string[]) => {
  let i = 0
  while (args[i]?.startsWith('-')) i += args[i] === '-C' || args[i] === '-c' ? 2 : 1
  return args.slice(i)
}

const pushesToMain = (args: string[]) =>
  args.some(arg => {
    if (arg.startsWith('-')) return false
    const destination = arg.replace(/^\+/, '').split(':').pop() ?? ''
    return destination.replace(/^refs\/heads\//, '') === 'main'
  })

type MergeTarget = { selector?: string; repo?: string }

const parsePrMerge = (args: string[]) => {
  const target: MergeTarget = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '-R' || arg === '--repo') target.repo = args[++i]
    else if (arg.startsWith('--repo=')) target.repo = arg.slice('--repo='.length)
    else if (MERGE_VALUE_FLAGS.has(arg)) i++
    else if (!arg.startsWith('-') && target.selector === undefined) target.selector = arg
  }
  return target
}

const parseApiMerge = (args: string[]): MergeTarget | undefined => {
  const isPut = args.some(
    (arg, i) => /^(-X|--method)=?PUT$/i.test(arg) || ((arg === '-X' || arg === '--method') && args[i + 1]?.toUpperCase() === 'PUT'),
  )
  if (!isPut) return undefined
  for (const arg of args) {
    const match = PULL_MERGE.exec(arg)
    if (match) return { selector: match[2], repo: match[1]?.includes('{') ? undefined : match[1] }
  }
  return undefined
}

const parseBase = (stdout: string) => {
  try {
    const parsed: unknown = JSON.parse(stdout)
    const isBase = typeof parsed === 'object' && parsed !== null && 'baseRefName' in parsed && typeof parsed.baseRefName === 'string'
    return isBase ? parsed.baseRefName : undefined
  } catch {
    return undefined
  }
}

const checkMerge = async ($: Engine, { selector, repo }: MergeTarget) => {
  const argv = ['gh', 'pr', 'view', ...(selector ? [selector] : []), ...(repo ? ['-R', repo] : []), '--json', 'baseRefName']
  const base = await $.process.run(argv, { timeoutMs: 10_000 }).then(
    ran => (ran.exitCode === 0 ? parseBase(ran.stdout) : undefined),
    () => undefined,
  )
  if (base === undefined) return UNREADABLE
  return base === 'main' ? OWNER_ONLY : undefined
}

const checkSegment = async ($: Engine, segment: string[]) => {
  const [program, ...args] = skipPrefixes(segment)
  if (program === 'git') {
    const [subcommand, ...rest] = skipGitOptions(args)
    return subcommand === 'push' && pushesToMain(rest) ? OWNER_ONLY : undefined
  }
  if (program === 'gh' && args[0] === 'pr' && args[1] === 'merge') return checkMerge($, parsePrMerge(args.slice(2)))
  if (program === 'gh' && args[0] === 'api') {
    const target = parseApiMerge(args.slice(1))
    return target ? checkMerge($, target) : undefined
  }
  return undefined
}

const checkCommand = async ($: Engine, command: string) => {
  for (const segment of splitCommands(command)) {
    const reason = await checkSegment($, segment)
    if (reason !== undefined) return reason
  }
  return undefined
}

const checkEdit = async ($: Engine, path: string, agentId: string | undefined) =>
  agentId !== undefined || (await isAllowedPath($, path)) ? undefined : DELEGATE

const refusal = ($: Engine, e: ToolCallInput) => {
  switch (e.tool) {
    case 'Edit':
    case 'Write':
      return checkEdit($, e.file_path, e.agentId)
    case 'NotebookEdit':
      return checkEdit($, e.notebook_path, e.agentId)
    case 'Bash':
    case 'Monitor':
      return e.command === undefined ? undefined : checkCommand($, e.command)
    default:
      return undefined
  }
}

export const registerPolicy = (on: On) => {
  on('tool.call', async ($, e, next) => {
    const reason = await refusal($, e)
    return reason === undefined ? next(e) : { deny: reason }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'The Studio 201 policy check failed.' }))
}

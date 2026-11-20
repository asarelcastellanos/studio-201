import type { EngineInterface, On } from 'claude-code'
import { parseShell } from './shell'
import type { Redirect, SimpleCommand } from './shell'

type Shell = Pick<EngineInterface, 'agent' | 'env' | 'process'>

type Invocation = {
  program: string
  args: readonly string[]
  redirects: readonly Redirect[]
  cwd: string | undefined
  isDynamic: boolean
}

type Operation =
  | {
      kind: 'push'
      destinations: readonly string[]
      pushesEveryBranch: boolean
      directories: readonly string[]
      cwd: string | undefined
      isDynamic: boolean
    }
  | {
      kind: 'merge'
      pullRequest: string | undefined
      repository: string | undefined
      cwd: string | undefined
      isDynamic: boolean
    }
  | { kind: 'blocked' }

type Wrapped =
  | { kind: 'command'; program: string; args: readonly string[]; isDynamic: boolean }
  | { kind: 'script'; script: string }
  | { kind: 'nothing' }

type WrapperSpec = {
  valueFlags: ReadonlySet<string>
  leadingOperands: number
  skipsAssignments: boolean
  isDynamic: boolean
}

type ProgramWrite =
  | { kind: 'none' }
  | { kind: 'unbounded' }
  | { kind: 'paths'; paths: readonly string[]; qaMayWrite: boolean }

type ReadOnlyContext = {
  tempDirs: readonly string[]
  qaDir: string | undefined
  fallbackCwd: string | undefined
}

type AgentFacts = { role: string; cwd: string | undefined }

const MAIN_BRANCH = 'main'
const CURRENT_BRANCH = 'HEAD'
const LOOKUP_TIMEOUT_MS = 10000
const MAX_UNWRAP_DEPTH = 8
const FIXED_TEMP_DIRS = ['/private/tmp', '/tmp']
const DEVICES: ReadonlySet<string> = new Set(['/dev/null', '/dev/stderr', '/dev/stdout'])

const DELEGATE_REASON =
  "Delegate this to an agent, such as coder or mechanic. The main session doesn't change repo files. It writes only notes, plans and temp files."
const OWNER_ONLY_REASON =
  'Only the owner merges into main. Push to an issue or feature branch and open a PR into the feature branch.'
const READ_ONLY_REASON =
  "This role is read-only, so it can't write files. Report what you found and let the orchestrator delegate the change."
const CHECK_FAILED_REASON = 'The policy check failed, so this call is refused. Retry it, or ask the owner.'

const READ_ONLY_ROLES: ReadonlySet<string> = new Set([
  'scout',
  'researcher',
  'reviewer',
  'design-critic',
  'qa-runner',
])
const QA_ROLE = 'qa-runner'

const MAIN_READ_PROGRAMS: ReadonlySet<string> = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'rg',
  'find',
  'sed',
  'sort',
  'uniq',
  'cut',
  'tr',
  'jq',
  'diff',
  'cmp',
  'file',
  'stat',
  'du',
  'pwd',
  'echo',
  'printf',
  'date',
  'which',
  'basename',
  'dirname',
  'realpath',
  'test',
  '[',
  'true',
  'false',
  'sleep',
  'cd',
  'tree',
  ':',
  'export',
  'unset',
  'read',
  'exit',
  'return',
])
const MAIN_TEMP_WRITERS: ReadonlySet<string> = new Set(['rm', 'cp', 'mkdir', 'touch', 'chmod'])
const MAIN_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'status',
  'log',
  'diff',
  'show',
  'rev-parse',
  'ls-files',
  'ls-remote',
  'fetch',
  'remote',
  'branch',
  'tag',
  'worktree',
  'add',
  'commit',
  'push',
  'switch',
  'merge',
  'config',
  'blame',
  'grep',
  'describe',
  'shortlog',
])
const MAIN_WORKTREE_SUBCOMMANDS: ReadonlySet<string> = new Set(['add', 'list'])
const MAIN_CLAUDE_PLUGIN_SUBCOMMANDS: ReadonlySet<string> = new Set(['validate', 'test', 'list'])

const GIT_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
])
const PUSH_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-o',
  '--push-option',
  '--receive-pack',
  '--exec',
  '--repo',
])
const PR_MERGE_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-t',
  '--subject',
  '-A',
  '--author-email',
  '--match-head-commit',
])
const API_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-X',
  '--method',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '-H',
  '--header',
  '--input',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--hostname',
  '--cache',
  '-p',
  '--preview',
])
const SHELL_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(['-o', '+o', '-O', '+O'])
const NO_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set()

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const INTERPRETER = /^(?:python[\d.]*|node|deno|bun|perl|ruby|php|lua|sh|bash|zsh|dash|ksh)$/
const FIND_WRITE_ACTIONS: ReadonlySet<string> = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-fls',
])
const GRAPHQL_MERGE_FIELDS = /mergePullRequest|enablePullRequestAutoMerge/

const wrapper = (
  valueFlags: readonly string[] = [],
  options: Partial<Omit<WrapperSpec, 'valueFlags'>> = {},
): WrapperSpec => ({
  valueFlags: new Set(valueFlags),
  leadingOperands: 0,
  skipsAssignments: false,
  isDynamic: false,
  ...options,
})

const WRAPPERS: ReadonlyMap<string, WrapperSpec> = new Map([
  ['time', wrapper()],
  ['command', wrapper()],
  ['builtin', wrapper()],
  ['nohup', wrapper()],
  ['exec', wrapper(['-a'])],
  ['nice', wrapper(['-n'])],
  ['env', wrapper(['-u', '-C', '-S'], { skipsAssignments: true })],
  ['timeout', wrapper(['-s', '-k'], { leadingOperands: 1 })],
  [
    'sudo',
    wrapper(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '-r', '-t', '--user', '--group']),
  ],
  [
    'xargs',
    wrapper(['-I', '-J', '-n', '-P', '-L', '-s', '-E', '-d', '-a', '-R', '-S'], { isDynamic: true }),
  ],
])

const normalizePath = (path: string): string[] => {
  const segments: string[] = []

  for (const segment of path.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '' && segment !== '.') segments.push(segment)
  }

  return segments
}

const startsWithSegments = (segments: readonly string[], prefix: readonly string[]) =>
  prefix.every((segment, index) => segments[index] === segment)

const isUnderDirectory = (path: string, directory: string): boolean => {
  const directorySegments = normalizePath(directory)

  return (
    path.startsWith('/') &&
    directory.startsWith('/') &&
    directorySegments.length > 0 &&
    startsWithSegments(normalizePath(path), directorySegments)
  )
}

const resolvePath = (path: string, cwd: string | undefined): string | undefined => {
  if (path.startsWith('~') || path.includes('$')) return undefined
  if (path.startsWith('/')) return `/${normalizePath(path).join('/')}`
  if (cwd === undefined) return undefined

  return `/${normalizePath(`${cwd}/${path}`).join('/')}`
}

const isWithin = (path: string, cwd: string | undefined, directories: readonly string[]): boolean => {
  const resolved = resolvePath(path, cwd)

  return resolved !== undefined && directories.some(directory => isUnderDirectory(resolved, directory))
}

const withAndWithoutPrivatePrefix = (directory: string): string[] => {
  if (!directory.startsWith('/')) return []

  return directory.startsWith('/private/')
    ? [directory, directory.slice('/private'.length)]
    : [directory, `/private${directory}`]
}

const tempDirsOf = (systemTempDir: string | undefined): string[] =>
  [...FIXED_TEMP_DIRS, ...(systemTempDir === undefined ? [] : [systemTempDir])].flatMap(
    withAndWithoutPrivatePrefix,
  )

const isNotePath = (path: string, home: string | undefined): boolean => {
  if (home === undefined) return false

  const absolute = path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path
  if (!absolute.startsWith('/')) return false

  const homeSegments = normalizePath(home)
  const segments = normalizePath(absolute)
  if (!startsWithSegments(segments, homeSegments)) return false

  const [claudeDir, area, second, third, ...rest] = segments.slice(homeSegments.length)

  if (claudeDir !== '.claude') return false

  return (
    (area === 'plans' && second !== undefined) ||
    (area === 'projects' && second !== undefined && third === 'memory' && rest.length > 0)
  )
}

const positionalArgs = (args: readonly string[], optionsWithValue: ReadonlySet<string>): string[] => {
  const positionals: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg.startsWith('-')) index += optionsWithValue.has(arg) ? 1 : 0
    else positionals.push(arg)
  }

  return positionals
}

const optionValue = (args: readonly string[], names: readonly string[]): string | undefined => {
  for (const [index, arg] of args.entries()) {
    for (const name of names) {
      const isLong = name.startsWith('--')

      if (arg === name) return args[index + 1]
      if (isLong && arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
      if (!isLong && arg.startsWith(name) && arg.length > name.length) return arg.slice(name.length)
    }
  }

  return undefined
}

const programName = (program: string): string =>
  program.startsWith('/') ? (program.split('/').pop() ?? program) : program

const afterOptions = (args: readonly string[], spec: WrapperSpec): string[] => {
  let index = 0
  let skippedOperands = 0

  while (index < args.length) {
    const arg = args[index] ?? ''

    if (arg === '--') {
      index += 1
      break
    }

    if (arg.startsWith('-') && arg.length > 1) index += spec.valueFlags.has(arg) ? 2 : 1
    else if (spec.skipsAssignments && ASSIGNMENT.test(arg)) index += 1
    else if (skippedOperands < spec.leadingOperands) {
      skippedOperands += 1
      index += 1
    } else break
  }

  return args.slice(index)
}

const shellScript = (args: readonly string[]): Wrapped | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''

    if (/^-[a-zA-Z]*c$/.test(arg)) {
      const script = args[index + 1]

      return script === undefined ? { kind: 'nothing' } : { kind: 'script', script }
    }

    if (SHELL_OPTIONS_WITH_VALUE.has(arg)) index += 1
    else if (!arg.startsWith('-') && !arg.startsWith('+')) break
  }

  return undefined
}

const unwrap = (program: string, args: readonly string[]): Wrapped | undefined => {
  if (program === 'eval') {
    return args.length === 0 ? { kind: 'nothing' } : { kind: 'script', script: args.join(' ') }
  }

  if (SHELLS.has(program)) return shellScript(args)

  const spec = WRAPPERS.get(program)
  if (spec === undefined) return undefined
  if (program === 'command' && args.some(arg => arg === '-v' || arg === '-V')) return { kind: 'nothing' }

  const [next, ...rest] = afterOptions(args, spec)

  return next === undefined
    ? { kind: 'nothing' }
    : { kind: 'command', program: next, args: rest, isDynamic: spec.isDynamic }
}

const changedDirectory = (args: readonly string[], cwd: string | undefined): string | undefined => {
  const target = args.find(arg => !arg.startsWith('-'))

  return target === undefined ? undefined : resolvePath(target, cwd)
}

const withoutProgram = (command: SimpleCommand, cwd: string | undefined): Invocation => ({
  program: '',
  args: [],
  redirects: command.redirects,
  cwd,
  isDynamic: false,
})

const expandCommand = (
  command: SimpleCommand,
  state: { cwd: string | undefined },
  depth: number,
  isDynamic: boolean,
): Invocation[] => {
  const program = programName(command.program)
  const wrapped = depth < MAX_UNWRAP_DEPTH ? unwrap(program, command.args) : undefined

  if (wrapped === undefined) {
    const invocation = {
      program,
      args: command.args,
      redirects: command.redirects,
      cwd: state.cwd,
      isDynamic,
    }
    if (program === 'cd') state.cwd = changedDirectory(command.args, state.cwd)

    return [invocation]
  }

  switch (wrapped.kind) {
    case 'nothing':
      return [withoutProgram(command, state.cwd)]
    case 'script':
      return [
        withoutProgram(command, state.cwd),
        ...parseShell(wrapped.script).flatMap(inner => expandCommand(inner, state, depth + 1, false)),
      ]
    case 'command':
      return expandCommand(
        { program: wrapped.program, args: wrapped.args, redirects: command.redirects },
        state,
        depth + 1,
        isDynamic || wrapped.isDynamic,
      )
  }
}

const invocationsOf = (source: string): Invocation[] => {
  const state: { cwd: string | undefined } = { cwd: undefined }

  return parseShell(source).flatMap(command => expandCommand(command, state, 0, false))
}

const isFileWrite = ({ operator, target }: Redirect): boolean =>
  operator.includes('>') && !(operator === '>&' && /^(?:\d+|-)$/.test(target))

const isPermittedRedirect = (
  redirect: Redirect,
  cwd: string | undefined,
  directories: readonly string[],
): boolean =>
  !isFileWrite(redirect) || DEVICES.has(redirect.target) || isWithin(redirect.target, cwd, directories)

const parseGit = (args: readonly string[]) => {
  const directories: string[] = []
  let index = 0

  while (args[index]?.startsWith('-')) {
    const option = args[index] ?? ''
    if (option === '-C') directories.push(args[index + 1] ?? '')
    index += GIT_OPTIONS_WITH_VALUE.has(option) ? 2 : 1
  }

  return { subcommand: args[index], rest: args.slice(index + 1), directories }
}

const GIT_APPLY_DRY_RUN_FLAGS: readonly string[] = ['--check', '--stat', '--numstat', '--summary']

const hasInPlaceFlag = (args: readonly string[]): boolean =>
  args.some(arg => /^-[a-zA-Z]*i/.test(arg) || arg === '--in-place' || arg.startsWith('--in-place='))

const hasTarWriteMode = (args: readonly string[]): boolean => {
  const first = args[0] ?? ''

  return first.startsWith('--')
    ? ['--extract', '--get', '--create', '--append', '--update'].includes(first)
    : /[xcru]/.test(first.replace(/^-/, ''))
}

const hasCurlOutputFlag = (args: readonly string[]): boolean =>
  args.some(arg => /^-[a-zA-Z]*[oO]/.test(arg) || arg.startsWith('--output') || arg === '--remote-name')

const copyDestination = (args: readonly string[]): string[] => {
  const targetDirectory = optionValue(args, ['-t', '--target-directory'])
  const destination =
    targetDirectory ??
    positionalArgs(args, new Set(['-t', '--target-directory'])).at(-1)

  return destination === undefined ? [] : [destination]
}

const programWrite = (invocation: Invocation): ProgramWrite => {
  const { program, args, isDynamic } = invocation
  const unbounded: ProgramWrite = { kind: 'unbounded' }
  const paths = (list: readonly string[], qaMayWrite = false): ProgramWrite =>
    isDynamic ? unbounded : { kind: 'paths', paths: list, qaMayWrite }

  switch (program) {
    case 'rm':
    case 'rmdir':
      return paths(positionalArgs(args, NO_OPTIONS_WITH_VALUE))
    case 'touch':
      return paths(positionalArgs(args, new Set(['-t', '-d', '-r', '--date', '--reference'])), true)
    case 'mkdir':
      return paths(positionalArgs(args, new Set(['-m', '--mode'])), true)
    case 'chmod':
    case 'chown':
    case 'chgrp':
      return paths(args.filter(arg => !/^(?:-[RfvcHLP]+|--[a-z-]+)$/.test(arg)).slice(1))
    case 'truncate':
      return paths(positionalArgs(args, new Set(['-s', '--size', '-r', '--reference'])))
    case 'cp':
      return paths(copyDestination(args), true)
    case 'mv':
      return paths(
        [
          ...positionalArgs(args, new Set(['-t', '--target-directory'])),
          ...(optionValue(args, ['-t', '--target-directory']) ?? []),
        ],
      )
    case 'tee':
      return paths(positionalArgs(args, NO_OPTIONS_WITH_VALUE), true)
    case 'ln':
    case 'install':
    case 'rsync':
    case 'wget':
      return unbounded
    case 'dd':
      return args.some(arg => arg.startsWith('of=')) ? unbounded : { kind: 'none' }
    case 'patch':
      return args.includes('--dry-run') ? { kind: 'none' } : unbounded
    case 'git': {
      const { subcommand, rest } = parseGit(args)
      const isDryRun = rest.some(arg => GIT_APPLY_DRY_RUN_FLAGS.includes(arg))

      return subcommand === 'apply' && !isDryRun ? unbounded : { kind: 'none' }
    }
    case 'tar':
      return hasTarWriteMode(args) ? unbounded : { kind: 'none' }
    case 'unzip':
      return args.some(arg => ['-l', '-p', '-t', '-Z'].includes(arg)) ? { kind: 'none' } : unbounded
    case 'curl':
      return hasCurlOutputFlag(args) ? unbounded : { kind: 'none' }
    case 'sed':
    case 'perl':
      return hasInPlaceFlag(args) ? unbounded : { kind: 'none' }
    case 'awk':
    case 'gawk':
      return args.some(arg => arg === '-i' || arg.startsWith('-i')) ? unbounded : { kind: 'none' }
    case 'sort':
      return args.some(arg => /^-[a-zA-Z]*o/.test(arg) || arg.startsWith('--output'))
        ? unbounded
        : { kind: 'none' }
    case 'uniq':
      return positionalArgs(args, new Set(['-f', '-s', '-w'])).length >= 2 ? unbounded : { kind: 'none' }
    case 'tree':
      return args.some(arg => arg.startsWith('-o')) ? unbounded : { kind: 'none' }
    case 'find':
      return args.some(arg => FIND_WRITE_ACTIONS.has(arg)) ? unbounded : { kind: 'none' }
    default:
      return { kind: 'none' }
  }
}

const isAllowedGit = (args: readonly string[]): boolean => {
  const { subcommand, rest } = parseGit(args)

  if (subcommand === undefined) return true
  if (subcommand === 'worktree') return MAIN_WORKTREE_SUBCOMMANDS.has(rest[0] ?? '')

  return MAIN_GIT_SUBCOMMANDS.has(subcommand)
}

const isAllowedForMain = (invocation: Invocation, tempDirs: readonly string[]): boolean => {
  const { program, args, cwd } = invocation

  if (!invocation.redirects.every(redirect => isPermittedRedirect(redirect, cwd, tempDirs))) return false
  if (program === '') return true

  const write = programWrite(invocation)

  if (MAIN_TEMP_WRITERS.has(program)) {
    return write.kind === 'paths' && write.paths.every(path => isWithin(path, cwd, tempDirs))
  }

  if (write.kind !== 'none') return false
  if (MAIN_READ_PROGRAMS.has(program)) return true
  if (program === 'git') return isAllowedGit(args)
  if (program === 'gh') return true
  if (program === 'claude') return args[0] === 'plugin' && MAIN_CLAUDE_PLUGIN_SUBCOMMANDS.has(args[1] ?? '')

  return false
}

const hasInlineCode = (program: string, args: readonly string[]): boolean => {
  if (/^python[\d.]*$/.test(program)) return args.includes('-c')
  if (program === 'node' || program === 'bun') {
    return args.some(arg => ['-e', '--eval', '-p', '--print'].includes(arg))
  }
  if (program === 'ruby' || program === 'lua') return args.includes('-e')
  if (program === 'php') return args.includes('-r')
  if (program === 'perl') return args.some(arg => /^-[a-zA-Z]*[eE]$/.test(arg))
  if (program === 'deno') return args[0] === 'eval'

  return false
}

const readsCodeFromStdin = (args: readonly string[]): boolean => {
  const asksForInfo = args.some(arg => ['--version', '-v', '-V', '--help', '-h'].includes(arg))

  return !asksForInfo && !args.some(arg => !arg.startsWith('-'))
}

const runsInlineOrStdinCode = ({ program, args }: Invocation): boolean =>
  INTERPRETER.test(program) && (hasInlineCode(program, args) || readsCodeFromStdin(args))

const violatesReadOnly = (invocation: Invocation, context: ReadOnlyContext): boolean => {
  const cwd = invocation.cwd ?? context.fallbackCwd
  const redirectDirs =
    context.qaDir === undefined ? context.tempDirs : [...context.tempDirs, context.qaDir]

  if (!invocation.redirects.every(redirect => isPermittedRedirect(redirect, cwd, redirectDirs))) return true
  if (runsInlineOrStdinCode(invocation)) return true

  const write = programWrite(invocation)
  const { qaDir } = context

  switch (write.kind) {
    case 'none':
      return false
    case 'unbounded':
      return true
    case 'paths':
      return !(
        write.qaMayWrite &&
        qaDir !== undefined &&
        write.paths.every(path => isWithin(path, cwd, [qaDir]))
      )
  }
}

const withoutRepoFlag = (args: readonly string[]) => {
  const rest: string[] = []
  let repository: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''

    if (arg === '-R' || arg === '--repo') {
      repository = args[index + 1]
      index += 1
    } else if (arg.startsWith('--repo=')) {
      repository = arg.slice('--repo='.length)
    } else if (arg.startsWith('-R') && arg.length > 2) {
      repository = arg.slice(2)
    } else {
      rest.push(arg)
    }
  }

  return { rest, repository }
}

const destinationOf = (refspec: string): string => {
  const unforced = refspec.replace(/^\+/, '')
  const destination = unforced.slice(unforced.lastIndexOf(':') + 1)

  return destination.replace(/^refs\/heads\//, '')
}

const parsePush = (invocation: Invocation, args: readonly string[], directories: readonly string[]): Operation => {
  const [, ...refspecs] = positionalArgs(args, PUSH_OPTIONS_WITH_VALUE)

  return {
    kind: 'push',
    destinations: refspecs.length === 0 ? [CURRENT_BRANCH] : refspecs.map(destinationOf),
    pushesEveryBranch: args.includes('--all') || args.includes('--mirror'),
    directories,
    cwd: invocation.cwd,
    isDynamic: invocation.isDynamic,
  }
}

const pullRequestOf = (raw: string | undefined, repository: string | undefined) => {
  if (raw === undefined) return { pullRequest: undefined, repository }

  const url = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(raw)
  if (url !== null) return { pullRequest: url[2], repository: repository ?? url[1] }

  return { pullRequest: raw.replace(/^#/, ''), repository }
}

const fieldValue = (args: readonly string[], key: string): string | undefined =>
  args
    .map(arg => new RegExp(`^(?:-[fF])?${key}=(.*)$`).exec(arg)?.[1])
    .find(value => value !== undefined)

const parseApi = (invocation: Invocation, args: readonly string[]): Operation[] => {
  const hasFields = args.some(arg => /^-[fF]/.test(arg) || /^--(?:raw-field|field|input)/.test(arg))
  const method = (optionValue(args, ['-X', '--method']) ?? (hasFields ? 'POST' : 'GET')).toUpperCase()
  const endpoint = (positionalArgs(args, API_OPTIONS_WITH_VALUE)[0] ?? '')
    .split('?')[0]
    ?.replace(/^\/+|\/+$/g, '') ?? ''

  if (endpoint === 'graphql') {
    const readsQueryFromFile = args.some(
      arg => /query=@/.test(arg) || arg === '--input' || arg.startsWith('--input='),
    )

    return readsQueryFromFile || args.some(arg => GRAPHQL_MERGE_FIELDS.test(arg))
      ? [{ kind: 'blocked' }]
      : []
  }

  const mergeEndpoint = /(?:^|\/)pulls\/(\d+)\/merge$/.exec(endpoint)

  if (mergeEndpoint !== null && method === 'PUT') {
    const literalRepository = /^repos\/([^/{}]+\/[^/{}]+)\//.exec(endpoint)?.[1]

    return [
      {
        kind: 'merge',
        pullRequest: mergeEndpoint[1],
        repository: literalRepository,
        cwd: invocation.cwd,
        isDynamic: invocation.isDynamic,
      },
    ]
  }

  const changes = method !== 'GET'
  const writesMainRef = changes && /(?:^|\/)git\/refs\/heads\/main$/.test(endpoint)
  const mergesIntoMain = method === 'POST' && /\/merges$/.test(endpoint) && fieldValue(args, 'base') === MAIN_BRANCH
  const commitsToMain =
    changes && /\/contents\//.test(endpoint) && fieldValue(args, 'branch') === MAIN_BRANCH

  return writesMainRef || mergesIntoMain || commitsToMain ? [{ kind: 'blocked' }] : []
}

const operationsOf = (invocation: Invocation): Operation[] => {
  if (invocation.program === 'git') {
    const { subcommand, rest, directories } = parseGit(invocation.args)

    return subcommand === 'push' ? [parsePush(invocation, rest, directories)] : []
  }

  if (invocation.program !== 'gh') return []

  const { rest, repository } = withoutRepoFlag(invocation.args)
  const [command, subcommand, ...args] = rest

  if (command === 'api') return parseApi(invocation, [subcommand ?? '', ...args])

  if (command === 'pr' && subcommand === 'merge') {
    return [
      {
        kind: 'merge',
        ...pullRequestOf(positionalArgs(args, PR_MERGE_OPTIONS_WITH_VALUE)[0], repository),
        cwd: invocation.cwd,
        isDynamic: invocation.isDynamic,
      },
    ]
  }

  return []
}

const editsBaseToMain = (invocation: Invocation): boolean => {
  if (invocation.program !== 'gh') return false

  const [command, subcommand, ...args] = withoutRepoFlag(invocation.args).rest

  return command === 'pr' && subcommand === 'edit' && optionValue(args, ['--base', '-B']) === MAIN_BRANCH
}

const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loaded: Promise<T> | undefined

  return () => (loaded ??= load())
}

const lookupAgent = async ($: Shell, agentId: string): Promise<AgentFacts> => {
  const agents = await $.agent.list()
  const agent = agents.find(candidate => candidate.id === agentId)
  const type = agent?.type ?? ''

  return { role: type.slice(type.lastIndexOf(':') + 1), cwd: agent?.cwd }
}

const workingDirectory = async (
  base: string | undefined,
  directories: readonly string[],
  agentCwd: () => Promise<string | undefined>,
): Promise<string | undefined> => {
  const start = base ?? (await agentCwd())

  return directories.reduce<string | undefined>((cwd, directory) => resolvePath(directory, cwd), start)
}

const runLookup = async ($: Shell, argv: readonly string[], cwd: string | undefined) => {
  const result = await $.process.run(argv, { cwd, timeoutMs: LOOKUP_TIMEOUT_MS })

  if (result.exitCode !== 0) throw new Error(`${argv.join(' ')} exited with ${result.exitCode}`)

  return result.stdout
}

const parseBaseRefName = (stdout: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(stdout)

    return typeof parsed === 'object' &&
      parsed !== null &&
      'baseRefName' in parsed &&
      typeof parsed.baseRefName === 'string'
      ? parsed.baseRefName
      : undefined
  } catch {
    return undefined
  }
}

const currentBranch = async ($: Shell, cwd: string | undefined): Promise<string> =>
  (await runLookup($, ['git', 'branch', '--show-current'], cwd)).trim()

const pullRequestBase = async (
  $: Shell,
  pullRequest: string | undefined,
  repository: string | undefined,
  cwd: string | undefined,
): Promise<string | undefined> => {
  const selector = pullRequest === undefined ? [] : [pullRequest]
  const repo = repository === undefined ? [] : ['-R', repository]

  try {
    const stdout = await runLookup($, ['gh', 'pr', 'view', ...selector, ...repo, '--json', 'baseRefName'], cwd)

    return parseBaseRefName(stdout)
  } catch {
    return undefined
  }
}

const mayBeMain = (destination: string): boolean =>
  destination === MAIN_BRANCH || /[*?[]/.test(destination)

const targetsMain = async (
  $: Shell,
  operation: Operation,
  agentCwd: () => Promise<string | undefined>,
): Promise<boolean> => {
  switch (operation.kind) {
    case 'blocked':
      return true
    case 'merge': {
      if (operation.isDynamic) return true

      const cwd = await workingDirectory(operation.cwd, [], agentCwd)
      const base = await pullRequestBase($, operation.pullRequest, operation.repository, cwd)

      return base === undefined || base === MAIN_BRANCH
    }
    case 'push': {
      if (operation.pushesEveryBranch || operation.isDynamic) return true

      const needsBranch = operation.destinations.includes(CURRENT_BRANCH)
      const branch = needsBranch
        ? await currentBranch($, await workingDirectory(operation.cwd, operation.directories, agentCwd))
        : undefined

      return operation.destinations.some(destination =>
        mayBeMain(destination === CURRENT_BRANCH ? (branch ?? '') : destination),
      )
    }
  }
}

const refusesMain = async (
  $: Shell,
  invocations: readonly Invocation[],
  agentCwd: () => Promise<string | undefined>,
): Promise<boolean> => {
  const operations = invocations.flatMap(operationsOf)
  const hasMerge = operations.some(operation => operation.kind !== 'push')

  if (hasMerge && invocations.some(editsBaseToMain)) return true

  for (const operation of operations) {
    if (await targetsMain($, operation, agentCwd)) return true
  }

  return false
}

const tempDirs = async ($: Shell): Promise<string[]> => tempDirsOf(await $.env.get('TMPDIR'))

const shellRefusal = async (
  $: Shell,
  command: string,
  agentId: string | undefined,
): Promise<string | undefined> => {
  const invocations = invocationsOf(command)
  const agent = once(async () => (agentId === undefined ? undefined : lookupAgent($, agentId)))
  const agentCwd = async () => (await agent())?.cwd

  if (await refusesMain($, invocations, agentCwd)) return OWNER_ONLY_REASON

  const dirs = await tempDirs($)

  if (agentId === undefined) {
    return invocations.every(invocation => isAllowedForMain(invocation, dirs)) ? undefined : DELEGATE_REASON
  }

  const strict: ReadOnlyContext = { tempDirs: dirs, qaDir: undefined, fallbackCwd: undefined }
  if (!invocations.some(invocation => violatesReadOnly(invocation, strict))) return undefined

  const facts = await agent()
  if (facts === undefined || !READ_ONLY_ROLES.has(facts.role)) return undefined

  const qaDir = facts.role === QA_ROLE && facts.cwd !== undefined ? `${facts.cwd}/qa` : undefined
  const context: ReadOnlyContext = { tempDirs: dirs, qaDir, fallbackCwd: facts.cwd }

  return invocations.some(invocation => violatesReadOnly(invocation, context)) ? READ_ONLY_REASON : undefined
}

const editRefusal = async ($: Shell, path: string): Promise<string | undefined> => {
  const isAllowed =
    isNotePath(path, await $.env.get('HOME')) || isWithin(path, undefined, await tempDirs($))

  return isAllowed ? undefined : DELEGATE_REASON
}

export const registerPolicy = (on: On): void => {
  on('tool.call', async ($, e, next) => {
    let reason: string | undefined

    switch (e.tool) {
      case 'Edit':
      case 'Write':
        reason = e.agentId === undefined ? await editRefusal($, e.file_path) : undefined
        break
      case 'NotebookEdit':
        reason = e.agentId === undefined ? await editRefusal($, e.notebook_path) : undefined
        break
      case 'Bash':
      case 'Monitor':
        reason = e.command === undefined ? undefined : await shellRefusal($, e.command, e.agentId)
        break
    }

    return reason === undefined ? next(e) : { deny: reason }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: CHECK_FAILED_REASON }))
}

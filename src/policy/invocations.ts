import { EXPANSION, parseShell } from '../shell'
import type { Redirect, ShellItem, SimpleCommand } from '../shell'
import { optionValue, parseGit } from './args'
import { START_CWD, UNKNOWN_CWD, changeDirectory, isSameCwd } from './paths'
import type { Cwd, PathContext } from './paths'

export type Invocation = {
  program: string
  args: readonly string[]
  redirects: readonly Redirect[]
  cwd: Cwd
  isDynamic: boolean
}

type CommandLike = {
  program: string
  args: readonly string[]
  redirects: readonly Redirect[]
  pipedFrom?: SimpleCommand
}

type State = { cwd: Cwd; context: PathContext; isComplete: boolean }

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

const MAX_UNWRAP_DEPTH = 8
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const SHELL_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(['-o', '+o', '-O', '+O'])
const FIND_EXEC_FLAGS: ReadonlySet<string> = new Set(['-exec', '-execdir', '-ok', '-okdir'])
const CD_FLAGS: ReadonlySet<string> = new Set(['-L', '-P', '-e', '-@'])
const UNRESOLVED_INVOCATION: Invocation = {
  program: EXPANSION,
  args: [],
  redirects: [],
  cwd: UNKNOWN_CWD,
  isDynamic: false,
}

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
  ['caffeinate', wrapper(['-t', '-w'])],
  ['arch', wrapper(['-e'])],
  ['stdbuf', wrapper(['-i', '-o', '-e'])],
  ['watch', wrapper(['-n', '--interval', '-w'])],
  ['npx', wrapper(['-p', '--package'])],
  ['bunx', wrapper()],
  ['pnpx', wrapper()],
  ['exec', wrapper(['-a'])],
  ['nice', wrapper(['-n'])],
  ['env', wrapper(['-u', '-C'], { skipsAssignments: true })],
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

const heredocBody = (redirects: readonly Redirect[]): string | undefined =>
  redirects.find(redirect => redirect.operator === '<<' && redirect.body !== undefined)?.body

const stdinText = (command: CommandLike): string | undefined => {
  const hereString = command.redirects.find(redirect => redirect.operator === '<<<')?.target
  const source = command.pipedFrom

  if (heredocBody(command.redirects) !== undefined) return heredocBody(command.redirects)
  if (hereString !== undefined) return hereString
  if (source === undefined) return undefined
  if (source.program === 'echo' || source.program === 'printf') {
    return source.args.filter(arg => !arg.startsWith('-')).join(' ')
  }

  return source.program === 'cat' ? heredocBody(source.redirects) : undefined
}

const shellScript = (command: CommandLike): Wrapped | undefined => {
  const { args } = command

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''

    if (/^-[a-zA-Z]*c$/.test(arg)) {
      const script = args[index + 1]

      return script === undefined ? { kind: 'nothing' } : { kind: 'script', script }
    }

    if (SHELL_OPTIONS_WITH_VALUE.has(arg)) index += 1
    else if (!arg.startsWith('-') && !arg.startsWith('+')) return undefined
  }

  const script = stdinText(command)

  return script === undefined ? undefined : { kind: 'script', script }
}

const gitAlias = (args: readonly string[]): Wrapped | undefined => {
  const { subcommand, rest, globalArgs, configOverrides } = parseGit(args)
  if (subcommand === undefined) return undefined

  const definition = configOverrides
    .find(override => override.startsWith(`alias.${subcommand}=`))
    ?.slice(`alias.${subcommand}=`.length)

  if (definition === undefined) return undefined
  if (definition.startsWith('!')) return { kind: 'script', script: `${definition.slice(1)} ${rest.join(' ')}` }

  return {
    kind: 'command',
    program: 'git',
    args: [...globalArgs, ...definition.split(/\s+/).filter(word => word !== ''), ...rest],
    isDynamic: false,
  }
}

const unwrap = (program: string, command: CommandLike): Wrapped | undefined => {
  const { args } = command

  if (program === 'eval') {
    return args.length === 0 ? { kind: 'nothing' } : { kind: 'script', script: args.join(' ') }
  }

  if (SHELLS.has(program)) return shellScript(command)
  if (program === 'git') return gitAlias(args)

  const spec = WRAPPERS.get(program)
  if (spec === undefined) return undefined
  if (program === 'command' && args.some(arg => arg === '-v' || arg === '-V')) return { kind: 'nothing' }

  if (program === 'env') {
    const splitString = optionValue(args, ['-S', '--split-string'])
    if (splitString !== undefined) return { kind: 'script', script: splitString }
  }

  const [next, ...rest] = afterOptions(args, spec)

  return next === undefined
    ? { kind: 'nothing' }
    : { kind: 'command', program: next, args: rest, isDynamic: spec.isDynamic }
}

const execClauses = (args: readonly string[]): string[][] => {
  const clauses: string[][] = []

  for (let index = 0; index < args.length; index += 1) {
    if (!FIND_EXEC_FLAGS.has(args[index] ?? '')) continue

    const clause: string[] = []
    index += 1

    while (index < args.length && args[index] !== ';' && args[index] !== '+') {
      clause.push(args[index] ?? '')
      index += 1
    }

    clauses.push(clause)
  }

  return clauses
}

const bare = (command: CommandLike, cwd: Cwd): Invocation => ({
  program: '',
  args: [],
  redirects: command.redirects,
  cwd,
  isDynamic: false,
})

const expandScript = (script: string, state: State, depth: number): Invocation[] => {
  const parsed = parseShell(script)
  if (!parsed.isComplete) state.isComplete = false

  const saved = state.cwd
  const invocations = expandItems(parsed.items, state, depth + 1)
  state.cwd = saved

  return invocations
}

const expandCommand = (
  command: CommandLike,
  state: State,
  depth: number,
  isDynamic: boolean,
): Invocation[] => {
  if (depth >= MAX_UNWRAP_DEPTH) return [UNRESOLVED_INVOCATION]

  const program = programName(command.program)
  const wrapped = unwrap(program, command)

  if (wrapped === undefined) {
    const invocation: Invocation = {
      program,
      args: command.args,
      redirects: command.redirects,
      cwd: state.cwd,
      isDynamic,
    }
    const executed = program === 'find' ? execClauses(command.args) : []

    if (program === 'cd') {
      const target = command.args.find(arg => !CD_FLAGS.has(arg))
      state.cwd = changeDirectory(state.cwd, target, state.context)
    }

    if (program === 'pushd' || program === 'popd') state.cwd = UNKNOWN_CWD

    return [
      invocation,
      ...executed.flatMap(([inner = '', ...innerArgs]) =>
        expandCommand({ program: inner, args: innerArgs, redirects: [] }, state, depth + 1, true),
      ),
    ]
  }

  switch (wrapped.kind) {
    case 'nothing':
      return [bare(command, state.cwd)]
    case 'script':
      return [bare(command, state.cwd), ...expandScript(wrapped.script, state, depth)]
    case 'command':
      return expandCommand(
        { program: wrapped.program, args: wrapped.args, redirects: command.redirects },
        state,
        depth + 1,
        isDynamic || wrapped.isDynamic,
      )
  }
}

const expandItem = (item: ShellItem, state: State, depth: number): Invocation[] => {
  const saved = state.cwd

  switch (item.kind) {
    case 'command':
      return expandCommand(item, state, depth, false)
    case 'scope': {
      const invocations = expandItems(item.items, state, depth)
      state.cwd = saved

      return invocations
    }
    case 'conditional': {
      const invocations = expandItems(item.items, state, depth)
      if (!isSameCwd(state.cwd, saved)) state.cwd = UNKNOWN_CWD

      return invocations
    }
  }
}

const expandItems = (items: readonly ShellItem[], state: State, depth: number): Invocation[] =>
  items.flatMap(item => expandItem(item, state, depth))

export const expandShell = (
  source: string,
  context: PathContext,
): { invocations: Invocation[]; isComplete: boolean } => {
  const parsed = parseShell(source)
  const state: State = { cwd: START_CWD, context, isComplete: parsed.isComplete }
  const invocations = expandItems(parsed.items, state, 0)

  return { invocations, isComplete: state.isComplete }
}

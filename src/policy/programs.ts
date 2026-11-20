import type { Redirect } from '../shell'
import {
  NO_OPTIONS_WITH_VALUE,
  isUnresolved,
  optionValue,
  parseGit,
  positionalArgs,
  withoutRepoFlag,
} from './args'
import type { Invocation } from './invocations'
import { isTempRoot, isWithin, resolvePath } from './paths'
import type { PathContext } from './paths'

type ProgramWrite =
  | { kind: 'none' }
  | { kind: 'unbounded' }
  | { kind: 'paths'; paths: readonly string[]; qaMayWrite: boolean; removes: boolean }

const DEVICES: ReadonlySet<string> = new Set(['/dev/null', '/dev/stderr', '/dev/stdout'])

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
  'awk',
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
  '[[',
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
  'local',
  'declare',
  'set',
])
const MAIN_TEMP_WRITERS: ReadonlySet<string> = new Set([
  'rm',
  'cp',
  'mv',
  'mkdir',
  'touch',
  'chmod',
  'tee',
  'mktemp',
  'gh',
])
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
  'pull',
  'switch',
  'merge',
  'config',
  'blame',
  'grep',
  'describe',
  'shortlog',
])
const MAIN_WORKTREE_SUBCOMMANDS: ReadonlySet<string> = new Set(['add', 'list', 'remove', 'prune'])
const MAIN_CLAUDE_PLUGIN_SUBCOMMANDS: ReadonlySet<string> = new Set(['validate', 'test', 'list'])
const SAFE_GIT_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'commit.gpgsign',
  'tag.gpgsign',
  'user.name',
  'user.email',
  'color.ui',
  'core.quotepath',
])
const GIT_CONFIG_READ_FLAGS: ReadonlySet<string> = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--list',
  '-l',
])
const GIT_CONFIG_WRITE_FLAGS: ReadonlySet<string> = new Set([
  '--unset',
  '--unset-all',
  '--add',
  '--replace-all',
  '--edit',
  '-e',
  '--rename-section',
  '--remove-section',
])
const READ_ONLY_BLOCKED_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'checkout',
  'restore',
  'reset',
  'clean',
  'stash',
  'switch',
  'commit',
  'add',
  'merge',
  'rebase',
  'pull',
  'rm',
  'mv',
  'cherry-pick',
  'revert',
  'am',
])
const GIT_APPLY_DRY_RUN_FLAGS: readonly string[] = ['--check', '--stat', '--numstat', '--summary']
const FIND_WRITE_ACTIONS: ReadonlySet<string> = new Set([
  '-delete',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-fls',
])
const CURL_VALUE_LETTERS: ReadonlySet<string> = new Set('XHdAeuFTmrwxyzYbcCEPQtUK')
const COPY_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(['-t', '--target-directory'])
const RUN_MODE_FLAGS: readonly string[] = ['-m', '--test', '--version', '-v', '-V', '--help', '-h']
const INTERPRETER = /^(?:python[\d.]*|node|deno|bun|tsx|ts-node|perl|ruby|php|lua|sh|bash|zsh|dash|ksh)$/

const SED_WRITE_COMMAND =
  /(?:^|[;{}\n])\s*(?:[\d$]+|\/[^/]*\/)?(?:,\s*(?:[\d$]+|\/[^/]*\/))?\s*[wWe](?:\s|$)/
const SED_WRITE_FLAG = /\bs(.)(?:(?!\1).)*\1(?:(?!\1).)*\1[a-zA-Z0-9]*[we](?:\s|$)/
const AWK_WRITE = /\bsystem\s*\(|\b(?:print|printf)\b[^}]*>|\|\s*(?:"|getline)/

const NONE: ProgramWrite = { kind: 'none' }
const UNBOUNDED: ProgramWrite = { kind: 'unbounded' }

const targetDirectory = (args: readonly string[]): string[] => {
  const directory = optionValue(args, ['-t', '--target-directory'])

  return directory === undefined ? [] : [directory]
}

const copyDestination = (args: readonly string[]): string[] => {
  const explicit = targetDirectory(args)
  if (explicit.length > 0) return explicit

  const destination = positionalArgs(args, COPY_OPTIONS_WITH_VALUE).at(-1)

  return destination === undefined ? [] : [destination]
}

const hasInPlaceFlag = (args: readonly string[]): boolean =>
  args.some(arg => /^-[a-zA-Z]*i/.test(arg) || arg === '--in-place' || arg.startsWith('--in-place='))

const sedWritesFiles = (args: readonly string[]): boolean =>
  hasInPlaceFlag(args) ||
  args.some(arg => !arg.startsWith('-') && (SED_WRITE_COMMAND.test(arg) || SED_WRITE_FLAG.test(arg)))

const awkWritesFiles = (args: readonly string[]): boolean =>
  args.some(arg => arg === '-i' || arg.startsWith('-i') || AWK_WRITE.test(arg))

const hasTarWriteMode = (args: readonly string[]): boolean => {
  const first = args[0] ?? ''

  return first.startsWith('--')
    ? ['--extract', '--get', '--create', '--append', '--update'].includes(first)
    : /[xcru]/.test(first.replace(/^-/, ''))
}

const curlClusterWritesFile = (arg: string): boolean => {
  if (!/^-[a-zA-Z]/.test(arg)) return false

  for (const letter of arg.slice(1)) {
    if (letter === 'o' || letter === 'O') return true
    if (CURL_VALUE_LETTERS.has(letter)) return false
  }

  return false
}

const curlWritesFile = (args: readonly string[]): boolean =>
  args.some(
    arg =>
      curlClusterWritesFile(arg) ||
      arg.startsWith('--output') ||
      arg.startsWith('--remote-name'),
  )

const wgetWritesFile = (args: readonly string[]): boolean =>
  !args.some(
    (arg, index) =>
      /^-[a-zA-Z]*O-$/.test(arg) ||
      arg === '--output-document=-' ||
      (/^-[a-zA-Z]*O$/.test(arg) && args[index + 1] === '-'),
  )

const ghWrite = (args: readonly string[]): ProgramWrite => {
  const [command, subcommand, ...rest] = withoutRepoFlag(args).rest
  const downloadDirectory = optionValue(rest, ['-D', '--dir']) ?? '.'

  if (command === 'alias' || command === 'extension' || command === 'ext') return UNBOUNDED
  if (command === 'pr' && (subcommand === 'checkout' || subcommand === 'co')) return UNBOUNDED

  if ((command === 'run' || command === 'release') && subcommand === 'download') {
    return { kind: 'paths', paths: [downloadDirectory], qaMayWrite: false, removes: false }
  }

  if (command === 'repo' && subcommand === 'clone') {
    const directory = positionalArgs(rest, NO_OPTIONS_WITH_VALUE)[1] ?? '.'

    return { kind: 'paths', paths: [directory], qaMayWrite: false, removes: false }
  }

  return NONE
}

const programWrite = (invocation: Invocation): ProgramWrite => {
  const { program, args, isDynamic } = invocation
  const paths = (list: readonly string[], qaMayWrite = false, removes = false): ProgramWrite =>
    isDynamic ? UNBOUNDED : { kind: 'paths', paths: list, qaMayWrite, removes }
  const namedPaths = (list: readonly string[], qaMayWrite = false, removes = false): ProgramWrite =>
    list.length === 0 ? UNBOUNDED : paths(list, qaMayWrite, removes)

  if (args.some(arg => arg === '--output' || arg.startsWith('--output='))) return UNBOUNDED
  if (program === 'rg' && args.some(arg => arg === '--pre' || arg.startsWith('--pre='))) return UNBOUNDED

  switch (program) {
    case 'rm':
    case 'rmdir':
      return namedPaths(positionalArgs(args, NO_OPTIONS_WITH_VALUE), false, true)
    case 'touch':
      return namedPaths(positionalArgs(args, new Set(['-t', '-d', '-r', '--date', '--reference'])), true)
    case 'mkdir':
      return namedPaths(positionalArgs(args, new Set(['-m', '--mode'])), true)
    case 'mktemp': {
      const directory = optionValue(args, ['-p', '--tmpdir'])

      return paths([
        ...positionalArgs(args, new Set(['-p', '--tmpdir'])),
        ...(directory === undefined ? [] : [directory]),
      ])
    }
    case 'chmod':
    case 'chown':
    case 'chgrp':
      return namedPaths(args.filter(arg => !/^(?:-[RfvcHLP]+|--[a-z-]+)$/.test(arg)).slice(1))
    case 'truncate':
      return namedPaths(positionalArgs(args, new Set(['-s', '--size', '-r', '--reference'])))
    case 'cp':
      return namedPaths(copyDestination(args), true)
    case 'mv':
      return namedPaths([...positionalArgs(args, COPY_OPTIONS_WITH_VALUE), ...targetDirectory(args)])
    case 'tee':
      return paths(positionalArgs(args, NO_OPTIONS_WITH_VALUE), true)
    case 'ln':
    case 'install':
    case 'rsync':
      return UNBOUNDED
    case 'wget':
      return wgetWritesFile(args) ? UNBOUNDED : NONE
    case 'dd':
      return args.some(arg => arg.startsWith('of=')) ? UNBOUNDED : NONE
    case 'patch':
      return args.includes('--dry-run') ? NONE : UNBOUNDED
    case 'git': {
      const { subcommand, rest } = parseGit(args)
      const isDryRun = rest.some(arg => GIT_APPLY_DRY_RUN_FLAGS.includes(arg))

      return subcommand === 'apply' && !isDryRun ? UNBOUNDED : NONE
    }
    case 'tar':
      return hasTarWriteMode(args) ? UNBOUNDED : NONE
    case 'unzip':
      return args.some(arg => ['-l', '-p', '-t', '-Z'].includes(arg)) ? NONE : UNBOUNDED
    case 'curl':
      return curlWritesFile(args) ? UNBOUNDED : NONE
    case 'sed':
      return sedWritesFiles(args) ? UNBOUNDED : NONE
    case 'perl':
      return hasInPlaceFlag(args) ? UNBOUNDED : NONE
    case 'awk':
    case 'gawk':
      return awkWritesFiles(args) ? UNBOUNDED : NONE
    case 'sort':
      return args.some(arg => /^-[a-zA-Z]*o/.test(arg)) ? UNBOUNDED : NONE
    case 'uniq':
      return positionalArgs(args, new Set(['-f', '-s', '-w'])).length >= 2 ? UNBOUNDED : NONE
    case 'tree':
      return args.some(arg => arg.startsWith('-o')) ? UNBOUNDED : NONE
    case 'find':
      return args.some(arg => FIND_WRITE_ACTIONS.has(arg)) ? UNBOUNDED : NONE
    case 'gh':
      return ghWrite(args)
    default:
      return NONE
  }
}

const isFileWrite = ({ operator, target }: Redirect): boolean =>
  operator.includes('>') && !(operator === '>&' && /^(?:\d+|-)$/.test(target))

const hasPermittedRedirects = (
  invocation: Invocation,
  directories: readonly string[],
  context: PathContext,
): boolean =>
  invocation.redirects.every(
    redirect =>
      !isFileWrite(redirect) ||
      DEVICES.has(redirect.target) ||
      isWithin(redirect.target, invocation.cwd, directories, context),
  )

const writesStayIn = (
  write: Extract<ProgramWrite, { kind: 'paths' }>,
  invocation: Invocation,
  directories: readonly string[],
  context: PathContext,
): boolean =>
  write.paths.every(path => {
    const resolved = resolvePath(path, invocation.cwd, context)
    const isRemovingRoot = write.removes && resolved !== undefined && isTempRoot(resolved, context.tempDirs)

    return isWithin(path, invocation.cwd, directories, context) && !isRemovingRoot
  })

const isAllowedGit = (args: readonly string[]): boolean => {
  const { subcommand, rest, configOverrides } = parseGit(args)
  const hasSafeOverrides = configOverrides.every(override =>
    SAFE_GIT_CONFIG_KEYS.has(override.split('=')[0] ?? ''),
  )

  if (!hasSafeOverrides) return false
  if (subcommand === undefined) return true
  if (subcommand === 'worktree') return MAIN_WORKTREE_SUBCOMMANDS.has(rest[0] ?? '')

  if (subcommand === 'config') {
    return (
      rest.some(arg => GIT_CONFIG_READ_FLAGS.has(arg)) &&
      !rest.some(arg => GIT_CONFIG_WRITE_FLAGS.has(arg))
    )
  }

  if (subcommand === 'grep') {
    const opensPager = rest.some(arg => arg.startsWith('-O') || arg.startsWith('--open-files-in-pager'))

    return !opensPager
  }

  return MAIN_GIT_SUBCOMMANDS.has(subcommand)
}

export const isAllowedForMain = (invocation: Invocation, context: PathContext): boolean => {
  const { program, args } = invocation

  if (!hasPermittedRedirects(invocation, context.tempDirs, context)) return false
  if (program === '') return true

  const write = programWrite(invocation)

  if (write.kind === 'unbounded') return false

  if (write.kind === 'paths') {
    return MAIN_TEMP_WRITERS.has(program) && writesStayIn(write, invocation, context.tempDirs, context)
  }

  if (MAIN_READ_PROGRAMS.has(program)) return true
  if (program === 'git') return isAllowedGit(args)
  if (program === 'gh') return true
  if (program === 'claude') return args[0] === 'plugin' && MAIN_CLAUDE_PLUGIN_SUBCOMMANDS.has(args[1] ?? '')

  return false
}

const flagsBeforeScript = (
  args: readonly string[],
  isInlineFlag: (arg: string) => boolean,
  optionsWithValue: readonly string[] = [],
): boolean => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''

    if (isInlineFlag(arg)) return true
    if (optionsWithValue.includes(arg)) index += 1
    else if (!arg.startsWith('-')) return false
  }

  return false
}

const hasInlineCode = (program: string, args: readonly string[]): boolean => {
  if (/^python[\d.]*$/.test(program)) {
    return flagsBeforeScript(args, arg => /^-[a-zA-Z]*c$/.test(arg), ['-W', '-X', '-m'])
  }

  if (['node', 'bun', 'tsx', 'ts-node'].includes(program)) {
    return flagsBeforeScript(
      args,
      arg => ['-e', '--eval', '-p', '--print'].includes(arg),
      ['-r', '--require', '--import', '--loader'],
    )
  }

  if (program === 'ruby' || program === 'lua') return flagsBeforeScript(args, arg => arg === '-e')
  if (program === 'php') return flagsBeforeScript(args, arg => arg === '-r')
  if (program === 'perl') return args.some(arg => /^-[a-zA-Z]*[eE]$/.test(arg))
  if (program === 'deno') return args[0] === 'eval'

  return false
}

const readsCodeFromStdin = (args: readonly string[]): boolean =>
  !args.some(arg => !arg.startsWith('-')) && !args.some(arg => RUN_MODE_FLAGS.includes(arg))

const runsInlineOrStdinCode = ({ program, args }: Invocation): boolean =>
  INTERPRETER.test(program) && (hasInlineCode(program, args) || readsCodeFromStdin(args))

const violatesReadOnlyGit = (args: readonly string[]): boolean => {
  const { subcommand, rest, configOverrides } = parseGit(args)

  if (configOverrides.length > 0) return true
  if (subcommand === 'worktree') return rest[0] !== 'list'

  return subcommand !== undefined && READ_ONLY_BLOCKED_GIT_SUBCOMMANDS.has(subcommand)
}

export const violatesReadOnly = (
  invocation: Invocation,
  context: PathContext,
  qaDir: string | undefined,
): boolean => {
  const redirectDirs = qaDir === undefined ? context.tempDirs : [...context.tempDirs, qaDir]

  if (isUnresolved(invocation.program)) return true
  if (!hasPermittedRedirects(invocation, redirectDirs, context)) return true
  if (runsInlineOrStdinCode(invocation)) return true
  if (invocation.program === 'git' && violatesReadOnlyGit(invocation.args)) return true

  const write = programWrite(invocation)

  switch (write.kind) {
    case 'none':
      return false
    case 'unbounded':
      return true
    case 'paths': {
      const directories = write.qaMayWrite && qaDir !== undefined ? redirectDirs : context.tempDirs

      return !writesStayIn(write, invocation, directories, context)
    }
  }
}

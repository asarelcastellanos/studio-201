import type { EngineInterface, On } from 'claude-code'

type Shell = Pick<EngineInterface, 'agent' | 'env' | 'process'>

type Operation =
  | { kind: 'push'; destinations: readonly string[]; pushesEveryBranch: boolean }
  | { kind: 'merge'; pullRequest: string | undefined; repository: string | undefined }
  | { kind: 'merge-mutation' }

type FileWrite = { kind: 'redirect'; target: string } | { kind: 'command' } | { kind: 'inline-code' }

type Actor = { kind: 'main' } | { kind: 'writer' } | { kind: 'read-only'; canRedirectToQa: boolean }

const MAIN_BRANCH = 'main'
const CURRENT_BRANCH = 'HEAD'

const DELEGATE_REASON =
  "Delegate this edit to an agent, such as coder or mechanic. The main session plans and reviews and doesn't write code."
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
const QA_FOLDER = 'qa'
const FIXED_TEMP_DIRS = ['/private/tmp', '/tmp']

const FILE_WRITING_PROGRAMS: ReadonlySet<string> = new Set(['cp', 'mv', 'rm', 'touch', 'ln', 'install', 'patch'])
const INLINE_CODE_FLAGS: Readonly<Record<string, string>> = { python: '-c', python3: '-c', node: '-e' }

const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])
const PUSH_OPTIONS_WITH_VALUE = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])
const PR_MERGE_OPTIONS_WITH_VALUE = new Set([
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-t',
  '--subject',
  '-A',
  '--author-email',
  '--match-head-commit',
  '-R',
  '--repo',
])

const IN_PLACE_EDIT = /\b(?:sed|perl)\b[^|;&\n]*\s(?:-[a-zA-Z]{0,3}i(?:\.\w+)?|--in-place)(?=\s|$)/
const TEE = /\btee\b/
const GIT_APPLY = /\bgit\s+(?:-C\s+\S+\s+)?apply\b/
const SHELL_WRAPPER = /\b(?:sh|bash|zsh)\s+-c\s+("[^"]*"|'[^']*')/g
const REDIRECT = /\d*>>?\s*(\S+)/g
const MERGE_ENDPOINT = /pulls\/(\d+)\/merge$/

export const normalizePath = (path: string): string[] => {
  const segments: string[] = []

  for (const segment of path.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '' && segment !== '.') segments.push(segment)
  }

  return segments
}

const startsWithSegments = (segments: readonly string[], prefix: readonly string[]) =>
  prefix.every((segment, index) => segments[index] === segment)

export const isUnderDirectory = (path: string, directory: string): boolean => {
  const directorySegments = normalizePath(directory)

  return (
    path.startsWith('/') &&
    directory.startsWith('/') &&
    directorySegments.length > 0 &&
    startsWithSegments(normalizePath(path), directorySegments)
  )
}

export const isUnderAnyDirectory = (path: string, directories: readonly string[]): boolean =>
  directories.some(directory => isUnderDirectory(path, directory))

export const isInQaFolder = (path: string): boolean => {
  const segments = path.split('/')
  const [first, ...rest] = normalizePath(path)

  return !path.startsWith('/') && !segments.includes('..') && first === QA_FOLDER && rest.length > 0
}

export const isNotePath = (path: string, home: string | undefined): boolean => {
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

const withoutQuotedText = (command: string) => command.replace(/"[^"]*"|'[^']*'/g, '""')

const tokenize = (segment: string): string[] =>
  (segment.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) ?? []).map(token => token.replace(/["']/g, ''))

const withoutLeadingAssignments = (tokens: readonly string[]) => {
  const start = tokens.findIndex(token => !/^\w+=/.test(token))

  return start === -1 ? [] : tokens.slice(start)
}

const commandsOf = (text: string): string[][] =>
  text
    .split(/&&|\|\||[;|\n]/)
    .map(segment => withoutLeadingAssignments(tokenize(segment)))
    .filter(tokens => tokens.length > 0)

const writesOf = (tokens: readonly string[]): FileWrite[] => {
  const [program = '', ...args] = tokens
  const inlineCodeFlag = INLINE_CODE_FLAGS[program]

  if (FILE_WRITING_PROGRAMS.has(program)) return [{ kind: 'command' }]
  if (program === 'dd' && args.some(arg => arg.startsWith('of='))) return [{ kind: 'command' }]
  if (inlineCodeFlag !== undefined && args.includes(inlineCodeFlag)) return [{ kind: 'inline-code' }]

  return []
}

export const findWrites = (command: string): FileWrite[] => {
  const unquoted = withoutQuotedText(command)
  const wrapped = [...command.matchAll(SHELL_WRAPPER)].flatMap(([, payload = '']) =>
    findWrites(payload.slice(1, -1)),
  )
  const redirects = [...unquoted.matchAll(REDIRECT)].flatMap(([, target = '']): FileWrite[] =>
    target.startsWith('&') || target === '/dev/null' ? [] : [{ kind: 'redirect', target }],
  )
  const otherCommands: FileWrite[] =
    IN_PLACE_EDIT.test(unquoted) || TEE.test(unquoted) || GIT_APPLY.test(unquoted)
      ? [{ kind: 'command' }]
      : []

  return [...wrapped, ...redirects, ...otherCommands, ...commandsOf(unquoted).flatMap(writesOf)]
}

export const bashWriteRefusal = (
  writes: readonly FileWrite[],
  actor: Actor,
  tempDirs: readonly string[],
): string | undefined => {
  switch (actor.kind) {
    case 'writer':
      return undefined
    case 'main':
      return writes.every(write => write.kind === 'redirect' && isUnderAnyDirectory(write.target, tempDirs))
        ? undefined
        : DELEGATE_REASON
    case 'read-only':
      return writes.every(
        write =>
          write.kind === 'inline-code' ||
          (write.kind === 'redirect' && actor.canRedirectToQa && isInQaFolder(write.target)),
      )
        ? undefined
        : READ_ONLY_REASON
  }
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
    if (names.includes(arg)) return args[index + 1]

    const name = names.find(candidate => arg.startsWith(`${candidate}=`))
    if (name !== undefined) return arg.slice(name.length + 1)
  }

  return undefined
}

const destinationOf = (refspec: string): string => {
  const destination = refspec.slice(refspec.lastIndexOf(':') + 1)

  return destination.replace(/^refs\/heads\//, '')
}

const parsePush = (args: readonly string[]): Operation => {
  const [, ...refspecs] = positionalArgs(args, PUSH_OPTIONS_WITH_VALUE)

  return {
    kind: 'push',
    destinations: refspecs.length === 0 ? [CURRENT_BRANCH] : refspecs.map(destinationOf),
    pushesEveryBranch: args.includes('--all') || args.includes('--mirror'),
  }
}

const parseGit = (args: readonly string[]): Operation | undefined => {
  let index = 0

  while (args[index]?.startsWith('-')) {
    index += GIT_OPTIONS_WITH_VALUE.has(args[index] ?? '') ? 2 : 1
  }

  return args[index] === 'push' ? parsePush(args.slice(index + 1)) : undefined
}

const usesPut = (args: readonly string[]): boolean =>
  args.some(
    (arg, index) =>
      /^(?:-X|--method)=?PUT$/i.test(arg) ||
      (/^(?:-X|--method)$/.test(arg) && args[index + 1]?.toUpperCase() === 'PUT'),
  )

const parseApi = (args: readonly string[]): Operation | undefined => {
  if (args.includes('graphql') && args.some(arg => arg.includes('mergePullRequest'))) {
    return { kind: 'merge-mutation' }
  }

  const pullRequest = args.map(arg => MERGE_ENDPOINT.exec(arg)?.[1]).find(number => number !== undefined)

  return usesPut(args) && pullRequest !== undefined
    ? { kind: 'merge', pullRequest, repository: undefined }
    : undefined
}

const parseGh = (args: readonly string[]): Operation | undefined => {
  const [command, subcommand, ...rest] = args

  if (command === 'pr' && subcommand === 'merge') {
    return {
      kind: 'merge',
      pullRequest: positionalArgs(rest, PR_MERGE_OPTIONS_WITH_VALUE)[0],
      repository: optionValue(rest, ['-R', '--repo']),
    }
  }

  return command === 'api' ? parseApi([subcommand ?? '', ...rest]) : undefined
}

const parseOperation = (tokens: readonly string[]): Operation | undefined => {
  const [program, ...args] = tokens

  if (program === 'git') return parseGit(args)
  if (program === 'gh') return parseGh(args)

  return undefined
}

export const parseOperations = (command: string): Operation[] =>
  commandsOf(command)
    .map(parseOperation)
    .filter(operation => operation !== undefined)

export const parseBaseRefName = (stdout: string): string | undefined => {
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

const currentBranch = async ($: Shell): Promise<string> =>
  (await $.process.run(['git', 'branch', '--show-current'])).stdout.trim()

const pullRequestBase = async (
  $: Shell,
  { pullRequest, repository }: { pullRequest: string | undefined; repository: string | undefined },
) => {
  const selector = pullRequest === undefined ? [] : [pullRequest]
  const repo = repository === undefined ? [] : ['-R', repository]
  const { stdout } = await $.process.run(['gh', 'pr', 'view', ...selector, ...repo, '--json', 'baseRefName'])

  return parseBaseRefName(stdout)
}

const targetsMain = async ($: Shell, operation: Operation): Promise<boolean> => {
  switch (operation.kind) {
    case 'merge-mutation':
      return true
    case 'merge': {
      const base = await pullRequestBase($, operation)

      return base === undefined || base === MAIN_BRANCH
    }
    case 'push': {
      if (operation.pushesEveryBranch) return true

      const destinations = await Promise.all(
        operation.destinations.map(destination =>
          destination === CURRENT_BRANCH ? currentBranch($) : destination,
        ),
      )

      return destinations.includes(MAIN_BRANCH)
    }
  }
}

const refusesMergeIntoMain = async ($: Shell, command: string): Promise<boolean> => {
  for (const operation of parseOperations(command)) {
    if (await targetsMain($, operation)) return true
  }

  return false
}

const tempDirs = async ($: Shell): Promise<string[]> => {
  const systemTempDir = await $.env.get('TMPDIR')

  return systemTempDir === undefined ? FIXED_TEMP_DIRS : [...FIXED_TEMP_DIRS, systemTempDir]
}

const actorOf = async ($: Shell, agentId: string | undefined): Promise<Actor> => {
  if (agentId === undefined) return { kind: 'main' }

  const agents = await $.agent.list()
  const type = agents.find(agent => agent.id === agentId)?.type ?? ''
  const role = type.slice(type.lastIndexOf(':') + 1)

  return READ_ONLY_ROLES.has(role)
    ? { kind: 'read-only', canRedirectToQa: role === QA_ROLE }
    : { kind: 'writer' }
}

const bashRefusal = async ($: Shell, command: string, agentId: string | undefined) => {
  const writes = findWrites(command)

  if (writes.length > 0) {
    const actor = await actorOf($, agentId)
    const reason = bashWriteRefusal(writes, actor, actor.kind === 'main' ? await tempDirs($) : [])

    if (reason !== undefined) return reason
  }

  return (await refusesMergeIntoMain($, command)) ? OWNER_ONLY_REASON : undefined
}

export const registerPolicy = (on: On): void => {
  on('tool.call', async ($, e, next) => {
    switch (e.tool) {
      case 'Edit':
      case 'Write':
      case 'NotebookEdit': {
        if (e.agentId !== undefined) break

        const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
        const isAllowed =
          isNotePath(path, await $.env.get('HOME')) || isUnderAnyDirectory(path, await tempDirs($))

        if (!isAllowed) return { deny: DELEGATE_REASON }

        break
      }
      case 'Bash': {
        const reason = await bashRefusal($, e.command, e.agentId)

        if (reason !== undefined) return { deny: reason }

        break
      }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: CHECK_FAILED_REASON }))
}

import type { EngineInterface, On } from 'claude-code'

type Shell = Pick<EngineInterface, 'env' | 'process'>

type Operation =
  | { kind: 'push'; destinations: readonly string[]; pushesEveryBranch: boolean }
  | { kind: 'merge'; pullRequest: string | undefined }

const MAIN_BRANCH = 'main'
const CURRENT_BRANCH = 'HEAD'

const DELEGATE_REASON =
  "Delegate this edit to an agent, such as coder or mechanic. The main session plans and reviews and doesn't write code."
const OWNER_ONLY_REASON =
  'Only the owner merges into main. Push to an issue or feature branch and open a PR into the feature branch.'
const CHECK_FAILED_REASON = 'The policy check failed, so this call is refused. Retry it, or ask the owner.'

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

export const isNotePath = (path: string, home: string | undefined): boolean => {
  if (home === undefined) return false

  const absolute = path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path
  if (!absolute.startsWith('/')) return false

  const homeSegments = normalizePath(home)
  const segments = normalizePath(absolute)
  if (!homeSegments.every((segment, index) => segments[index] === segment)) return false

  const [claudeDir, area, second, third, ...rest] = segments.slice(homeSegments.length)

  if (claudeDir !== '.claude') return false

  return (
    (area === 'plans' && second !== undefined) ||
    (area === 'projects' && second !== undefined && third === 'memory' && rest.length > 0)
  )
}

const withoutQuotedText = (command: string) => command.replace(/"[^"]*"|'[^']*'/g, '""')

export const writesFile = (command: string): boolean => {
  const unquoted = withoutQuotedText(command)
  const redirectsToFile = [...unquoted.matchAll(REDIRECT)].some(
    ([, target]) => target !== undefined && !target.startsWith('&') && target !== '/dev/null',
  )

  return IN_PLACE_EDIT.test(unquoted) || TEE.test(unquoted) || redirectsToFile
}

const tokenize = (segment: string): string[] =>
  (segment.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) ?? []).map(token => token.replace(/["']/g, ''))

const withoutLeadingAssignments = (tokens: readonly string[]) => {
  const start = tokens.findIndex(token => !/^\w+=/.test(token))

  return start === -1 ? [] : tokens.slice(start)
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

const parseApiMerge = (args: readonly string[]): Operation | undefined => {
  const pullRequest = args.map(arg => MERGE_ENDPOINT.exec(arg)?.[1]).find(number => number !== undefined)

  return usesPut(args) && pullRequest !== undefined ? { kind: 'merge', pullRequest } : undefined
}

const parseGh = (args: readonly string[]): Operation | undefined => {
  const [command, subcommand, ...rest] = args

  if (command === 'pr' && subcommand === 'merge') {
    return { kind: 'merge', pullRequest: positionalArgs(rest, PR_MERGE_OPTIONS_WITH_VALUE)[0] }
  }

  return command === 'api' ? parseApiMerge([subcommand ?? '', ...rest]) : undefined
}

const parseOperation = (tokens: readonly string[]): Operation | undefined => {
  const [program, ...args] = withoutLeadingAssignments(tokens)

  if (program === 'git') return parseGit(args)
  if (program === 'gh') return parseGh(args)

  return undefined
}

export const parseOperations = (command: string): Operation[] =>
  command
    .split(/&&|\|\||[;|\n]/)
    .map(segment => parseOperation(tokenize(segment)))
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

const pullRequestBase = async ($: Shell, pullRequest: string | undefined) => {
  const selector = pullRequest === undefined ? [] : [pullRequest]
  const { stdout } = await $.process.run(['gh', 'pr', 'view', ...selector, '--json', 'baseRefName'])

  return parseBaseRefName(stdout)
}

const targetsMain = async ($: Shell, operation: Operation): Promise<boolean> => {
  if (operation.kind === 'merge') {
    const base = await pullRequestBase($, operation.pullRequest)

    return base === undefined || base === MAIN_BRANCH
  }

  if (operation.pushesEveryBranch) return true

  const destinations = await Promise.all(
    operation.destinations.map(destination =>
      destination === CURRENT_BRANCH ? currentBranch($) : destination,
    ),
  )

  return destinations.includes(MAIN_BRANCH)
}

const refusesMergeIntoMain = async ($: Shell, command: string): Promise<boolean> => {
  for (const operation of parseOperations(command)) {
    if (await targetsMain($, operation)) return true
  }

  return false
}

export const registerPolicy = (on: On): void => {
  on('tool.call', async ($, e, next) => {
    const isMainSession = e.agentId === undefined

    switch (e.tool) {
      case 'Edit':
      case 'Write':
      case 'NotebookEdit': {
        if (!isMainSession) break

        const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path

        if (!isNotePath(path, await $.env.get('HOME'))) return { deny: DELEGATE_REASON }

        break
      }
      case 'Bash': {
        if (isMainSession && writesFile(e.command)) return { deny: DELEGATE_REASON }
        if (await refusesMergeIntoMain($, e.command)) return { deny: OWNER_ONLY_REASON }

        break
      }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: CHECK_FAILED_REASON }))
}

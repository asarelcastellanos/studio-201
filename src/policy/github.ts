import { isUnresolved, optionValue, parseGit, positionalArgs, withoutRepoFlag } from './args'
import type { Invocation } from './invocations'
import { normalizePath } from './paths'
import type { Cwd } from './paths'

export type Operation =
  | {
      kind: 'push'
      destinations: readonly string[]
      pushesEveryBranch: boolean
      directories: readonly string[]
      cwd: Cwd
      isDynamic: boolean
    }
  | {
      kind: 'merge'
      pullRequest: string | undefined
      repository: string | undefined
      cwd: Cwd
      isDynamic: boolean
    }
  | { kind: 'blocked' }
  | { kind: 'unresolved' }

export const MAIN_BRANCH = 'main'
export const CURRENT_BRANCH = 'HEAD'

const MAX_BRACE_EXPANSIONS = 64
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
const GRAPHQL_MERGE_FIELDS = /mergePullRequest|enablePullRequestAutoMerge/

const expandBraces = (word: string): string[] => {
  const open = word.indexOf('{')
  if (open === -1) return [word]

  const commas: number[] = []
  let depth = 0
  let close = -1

  for (let index = open; index < word.length; index += 1) {
    const char = word[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (char === ',' && depth === 1) commas.push(index)

    if (depth === 0) {
      close = index
      break
    }
  }

  if (close === -1) return [word]

  if (commas.length === 0) {
    const literal = word.slice(0, close + 1)

    return expandBraces(word.slice(close + 1)).map(rest => `${literal}${rest}`)
  }

  const bounds = [open, ...commas, close]
  const options = bounds.slice(1).map((end, index) => word.slice((bounds[index] ?? 0) + 1, end))
  const prefix = word.slice(0, open)
  const suffix = word.slice(close + 1)

  return options
    .flatMap(option => expandBraces(`${prefix}${option}${suffix}`))
    .slice(0, MAX_BRACE_EXPANSIONS)
}

const globMatchesMain = (pattern: string): boolean => {
  let source = ''

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? ''

    if (char === '*') {
      source += '.*'
    } else if (char === '?') {
      source += '.'
    } else if (char === '[') {
      const end = pattern.indexOf(']', index + 1)

      if (end === -1) {
        source += '\\['
      } else {
        source += `[${pattern.slice(index + 1, end).replace(/^!/, '^')}]`
        index = end
      }
    } else {
      source += char.replace(/[.+^${}()|\\]/g, '\\$&')
    }
  }

  try {
    return new RegExp(`^${source}$`).test(MAIN_BRANCH)
  } catch {
    return true
  }
}

export const mayBeMain = (destination: string): boolean =>
  destination === MAIN_BRANCH || globMatchesMain(destination)

const destinationOf = (refspec: string): string => {
  const unforced = refspec.replace(/^\+/, '')
  const destination = unforced.slice(unforced.lastIndexOf(':') + 1)

  return destination.replace(/^(?:refs\/)?heads\//, '')
}

const parsePush = (
  invocation: Invocation,
  args: readonly string[],
  directories: readonly string[],
): Operation => {
  const hasRepoFlag = args.some(arg => arg === '--repo' || arg.startsWith('--repo='))
  const positionals = positionalArgs(args, PUSH_OPTIONS_WITH_VALUE)
  const refspecs = hasRepoFlag ? positionals : positionals.slice(1)

  if (refspecs.some(isUnresolved)) return { kind: 'unresolved' }

  return {
    kind: 'push',
    destinations:
      refspecs.length === 0
        ? [CURRENT_BRANCH]
        : refspecs.flatMap(refspec => expandBraces(refspec).map(destinationOf)),
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
    .map(arg => new RegExp(`^(?:-[fF]|--field=|--raw-field=)?${key}=(.*)$`).exec(arg)?.[1])
    .find(value => value !== undefined)

const normalizeEndpoint = (raw: string): string => {
  const withoutHost = raw.replace(/^https?:\/\/[^/]+\//, '')

  return normalizePath(withoutHost.split(/[?#]/)[0] ?? '').join('/')
}

const apiRequest = (args: readonly string[]) => {
  const rawEndpoint = positionalArgs(args, API_OPTIONS_WITH_VALUE)[0] ?? ''
  const rawMethod = optionValue(args, ['-X', '--method'])
  const hasFields = args.some(arg => /^-[fF]/.test(arg) || /^--(?:raw-field|field|input)/.test(arg))

  return {
    rawEndpoint,
    rawMethod,
    endpoint: normalizeEndpoint(rawEndpoint),
    method: (rawMethod ?? (hasFields ? 'POST' : 'GET')).toUpperCase(),
    readsInput: args.some(arg => arg === '--input' || arg.startsWith('--input=')),
  }
}

const parseApi = (invocation: Invocation, args: readonly string[]): Operation[] => {
  const { rawEndpoint, rawMethod, endpoint, method, readsInput } = apiRequest(args)
  const base = fieldValue(args, 'base')
  const branch = fieldValue(args, 'branch')
  const unresolvedParts = [rawEndpoint, rawMethod, fieldValue(args, 'query'), base, branch]

  if (unresolvedParts.some(part => part !== undefined && isUnresolved(part))) {
    return [{ kind: 'unresolved' }]
  }

  if (endpoint === 'graphql') {
    const readsQueryFromFile = args.some(arg => /query=@/.test(arg)) || readsInput

    return readsQueryFromFile || args.some(arg => GRAPHQL_MERGE_FIELDS.test(arg))
      ? [{ kind: 'blocked' }]
      : []
  }

  const mergeEndpoint = /(?:^|\/)pulls\/([^/]+)\/merge$/.exec(endpoint)

  if (mergeEndpoint !== null && method === 'PUT') {
    return [
      {
        kind: 'merge',
        pullRequest: mergeEndpoint[1],
        repository: /^repos\/([^/{}]+\/[^/{}]+)\//.exec(endpoint)?.[1],
        cwd: invocation.cwd,
        isDynamic: invocation.isDynamic,
      },
    ]
  }

  const changes = method !== 'GET'
  const writesMainRef = changes && /(?:^|\/)git\/refs\/heads\/main$/.test(endpoint)
  const mergesIntoMain =
    method === 'POST' && /\/merges$/.test(endpoint) && (base === MAIN_BRANCH || readsInput)
  const commitsToMain =
    changes && /\/contents\//.test(endpoint) && (branch === MAIN_BRANCH || readsInput)

  return writesMainRef || mergesIntoMain || commitsToMain ? [{ kind: 'blocked' }] : []
}

export const operationsOf = (invocation: Invocation): Operation[] => {
  if (invocation.program === 'git') {
    const { subcommand, rest, directories } = parseGit(invocation.args)

    return subcommand === 'push' ? [parsePush(invocation, rest, directories)] : []
  }

  if (invocation.program !== 'gh') return []

  const { rest, repository } = withoutRepoFlag(invocation.args)
  const [command = '', subcommand = '', ...args] = rest

  if (isUnresolved(command) || (command === 'pr' && isUnresolved(subcommand))) {
    return [{ kind: 'unresolved' }]
  }

  if (command === 'alias' && subcommand !== 'list') return [{ kind: 'blocked' }]
  if (command === 'api') return parseApi(invocation, [subcommand, ...args])
  if (command !== 'pr' || subcommand !== 'merge') return []

  const selector = positionalArgs(args, PR_MERGE_OPTIONS_WITH_VALUE)[0]
  const isUnresolvedTarget = [selector, repository].some(
    part => part !== undefined && isUnresolved(part),
  )

  if (isUnresolvedTarget) return [{ kind: 'unresolved' }]

  return [
    {
      kind: 'merge',
      ...pullRequestOf(selector, repository),
      cwd: invocation.cwd,
      isDynamic: invocation.isDynamic,
    },
  ]
}

export const changesBase = (invocation: Invocation): boolean => {
  if (invocation.program !== 'gh') return false

  const [command, subcommand = '', ...args] = withoutRepoFlag(invocation.args).rest
  const base = optionValue(args, ['--base', '-B'])

  if (command === 'pr' && subcommand === 'edit') return base !== undefined
  if (command === 'pr' && subcommand === 'create') {
    return base === MAIN_BRANCH || (base !== undefined && isUnresolved(base))
  }

  if (command !== 'api') return false

  const { endpoint, method } = apiRequest([subcommand, ...args])

  return method === 'PATCH' && /(?:^|\/)pulls\/[^/]+$/.test(endpoint)
}

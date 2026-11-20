import type { EngineInterface, On } from 'claude-code'
import { changesBase, CURRENT_BRANCH, MAIN_BRANCH, mayBeMain, operationsOf } from './github'
import type { Operation } from './github'
import { expandShell } from './invocations'
import type { Invocation } from './invocations'
import {
  START_CWD,
  changeDirectory,
  isNotePath,
  isWithin,
  processCwd,
  tempDirsOf,
} from './paths'
import type { Cwd, PathContext, ProcessCwd } from './paths'
import { isAllowedForMain, violatesReadOnly } from './programs'

type Shell = Pick<EngineInterface, 'agent' | 'env' | 'process'>

type AgentFacts = { role: string; cwd: string | undefined }

type Verdict = 'ok' | 'owner' | 'unresolved'

type AgentCwd = () => Promise<string | undefined>

const LOOKUP_TIMEOUT_MS = 10000
const QA_ROLE = 'qa-runner'
const READ_ONLY_ROLES: ReadonlySet<string> = new Set([
  'scout',
  'researcher',
  'reviewer',
  'design-critic',
  QA_ROLE,
])

const DELEGATE_REASON =
  "Delegate this to an agent, such as coder or mechanic. The main session doesn't change repo files. It writes only notes, plans and temp files."
const OWNER_ONLY_REASON =
  'Only the owner merges into main. Push to an issue or feature branch and open a PR into the feature branch.'
const READ_ONLY_REASON =
  "This role is read-only, so it can't write files. Report what you found and let the orchestrator delegate the change."
const UNRESOLVED_REASON =
  "Can't determine which PR, branch or endpoint this targets, so the policy refuses it. Name it literally."
const UNPARSEABLE_REASON =
  "The command can't be parsed, so the policy refuses it. Close every quote, bracket and substitution."
const CHECK_FAILED_REASON = 'The policy check failed, so this call is refused. Retry it, or ask the owner.'

const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loaded: Promise<T> | undefined

  return () => (loaded ??= load())
}

const pathContext = async ($: Shell): Promise<PathContext> => {
  const [home, systemTempDir] = await Promise.all([$.env.get('HOME'), $.env.get('TMPDIR')])

  return {
    startDir: undefined,
    variables: {
      ...(home === undefined ? {} : { HOME: home }),
      ...(systemTempDir === undefined ? {} : { TMPDIR: systemTempDir }),
    },
    tempDirs: tempDirsOf(systemTempDir),
  }
}

const lookupAgent = async ($: Shell, agentId: string): Promise<AgentFacts | undefined> => {
  const agents = await $.agent.list()
  const agent = agents.find(candidate => candidate.id === agentId)
  if (agent === undefined) return undefined

  return { role: agent.type.slice(agent.type.lastIndexOf(':') + 1), cwd: agent.cwd }
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

const pullRequestBase = async (
  $: Shell,
  pullRequest: string | undefined,
  repository: string | undefined,
  cwd: string | undefined,
): Promise<string | undefined> => {
  const selector = pullRequest === undefined ? [] : [pullRequest]
  const repo = repository === undefined ? [] : ['-R', repository]

  try {
    const argv = ['gh', 'pr', 'view', ...selector, ...repo, '--json', 'baseRefName']

    return parseBaseRefName(await runLookup($, argv, cwd))
  } catch {
    return undefined
  }
}

const workingDirectory = async (
  cwd: Cwd,
  directories: readonly string[],
  context: PathContext,
  agentCwd: AgentCwd,
): Promise<ProcessCwd> => {
  const target = directories.reduce<Cwd>(
    (current, directory) => changeDirectory(current, directory, context),
    cwd,
  )

  return processCwd(target, target.kind === 'start' ? await agentCwd() : undefined)
}

const mergeVerdict = async (
  $: Shell,
  operation: Extract<Operation, { kind: 'merge' }>,
  context: PathContext,
  agentCwd: AgentCwd,
): Promise<Verdict> => {
  if (operation.isDynamic) return 'owner'

  const location = await workingDirectory(operation.cwd, [], context, agentCwd)
  if (!location.isKnown) return 'unresolved'

  const base = await pullRequestBase($, operation.pullRequest, operation.repository, location.path)

  if (base === undefined) return operation.pullRequest === undefined ? 'owner' : 'unresolved'

  return base === MAIN_BRANCH ? 'owner' : 'ok'
}

const pushVerdict = async (
  $: Shell,
  operation: Extract<Operation, { kind: 'push' }>,
  context: PathContext,
  agentCwd: AgentCwd,
): Promise<Verdict> => {
  if (operation.pushesEveryBranch || operation.isDynamic) return 'owner'

  const named = operation.destinations.filter(destination => destination !== CURRENT_BRANCH)
  if (named.some(mayBeMain)) return 'owner'
  if (named.length === operation.destinations.length) return 'ok'

  const location = await workingDirectory(operation.cwd, operation.directories, context, agentCwd)
  if (!location.isKnown) return 'unresolved'

  const branch = (await runLookup($, ['git', 'branch', '--show-current'], location.path)).trim()

  return mayBeMain(branch) ? 'owner' : 'ok'
}

const operationVerdict = (
  $: Shell,
  operation: Operation,
  context: PathContext,
  agentCwd: AgentCwd,
): Promise<Verdict> | Verdict => {
  switch (operation.kind) {
    case 'blocked':
      return 'owner'
    case 'unresolved':
      return 'unresolved'
    case 'merge':
      return mergeVerdict($, operation, context, agentCwd)
    case 'push':
      return pushVerdict($, operation, context, agentCwd)
  }
}

const mainRefusal = async (
  $: Shell,
  invocations: readonly Invocation[],
  context: PathContext,
  agentCwd: AgentCwd,
): Promise<string | undefined> => {
  const operations = invocations.flatMap(operationsOf)
  const hasMerge = operations.some(operation => operation.kind === 'merge')

  if (hasMerge && invocations.some(changesBase)) return OWNER_ONLY_REASON

  let hasUnresolved = false

  for (const operation of operations) {
    const verdict = await operationVerdict($, operation, context, agentCwd)

    if (verdict === 'owner') return OWNER_ONLY_REASON
    if (verdict === 'unresolved') hasUnresolved = true
  }

  return hasUnresolved ? UNRESOLVED_REASON : undefined
}

const shellRefusal = async (
  $: Shell,
  command: string,
  agentId: string | undefined,
): Promise<string | undefined> => {
  const context = await pathContext($)
  const { invocations, isComplete } = expandShell(command, context)
  const agent = once(async () => (agentId === undefined ? undefined : lookupAgent($, agentId)))
  const agentCwd: AgentCwd = async () => (await agent())?.cwd

  if (!isComplete) return UNPARSEABLE_REASON

  if (agentId === undefined) {
    return invocations.every(invocation => isAllowedForMain(invocation, context))
      ? mainRefusal($, invocations, context, agentCwd)
      : DELEGATE_REASON
  }

  const reason = await mainRefusal($, invocations, context, agentCwd)
  if (reason !== undefined) return reason

  if (!invocations.some(invocation => violatesReadOnly(invocation, context, undefined))) {
    return undefined
  }

  const facts = await agent()
  if (facts === undefined || !READ_ONLY_ROLES.has(facts.role)) return undefined

  const agentContext: PathContext = { ...context, startDir: facts.cwd }
  const qaDir = facts.role === QA_ROLE && facts.cwd !== undefined ? `${facts.cwd}/qa` : undefined

  return invocations.some(invocation => violatesReadOnly(invocation, agentContext, qaDir))
    ? READ_ONLY_REASON
    : undefined
}

const editRefusal = async ($: Shell, path: string): Promise<string | undefined> => {
  const context = await pathContext($)
  const isAllowed =
    isNotePath(path, context.variables.HOME) || isWithin(path, START_CWD, context.tempDirs, context)

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

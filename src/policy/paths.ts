import { EXPANSION } from '../shell'

export type Cwd =
  | { kind: 'start'; relative: string }
  | { kind: 'absolute'; path: string }
  | { kind: 'unknown' }

export type PathContext = {
  startDir: string | undefined
  variables: Readonly<Record<string, string>>
  tempDirs: readonly string[]
}

export type ProcessCwd = { isKnown: true; path: string | undefined } | { isKnown: false }

export const START_CWD: Cwd = { kind: 'start', relative: '' }
export const UNKNOWN_CWD: Cwd = { kind: 'unknown' }

const FIXED_TEMP_DIRS = ['/private/tmp', '/tmp']
const GLOB_CHARACTERS = /[*?[]/

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

const asAbsolute = (segments: readonly string[]) => `/${segments.join('/')}`

const isUnderDirectory = (path: string, directory: string): boolean => {
  const directorySegments = normalizePath(directory)

  return (
    path.startsWith('/') &&
    directory.startsWith('/') &&
    directorySegments.length > 0 &&
    startsWithSegments(normalizePath(path), directorySegments)
  )
}

const withAndWithoutPrivatePrefix = (directory: string): string[] => {
  if (!directory.startsWith('/')) return []

  return directory.startsWith('/private/')
    ? [directory, directory.slice('/private'.length)]
    : [directory, `/private${directory}`]
}

export const tempDirsOf = (systemTempDir: string | undefined): string[] =>
  [...FIXED_TEMP_DIRS, ...(systemTempDir === undefined ? [] : [systemTempDir])].flatMap(
    withAndWithoutPrivatePrefix,
  )

export const isTempRoot = (resolvedPath: string, tempDirs: readonly string[]): boolean => {
  const segments = normalizePath(resolvedPath)

  return tempDirs.some(directory => {
    const root = normalizePath(directory)
    const isRoot = segments.length === root.length && startsWithSegments(segments, root)
    const last = segments.at(-1) ?? ''
    const isRootGlob =
      segments.length === root.length + 1 &&
      startsWithSegments(segments, root) &&
      GLOB_CHARACTERS.test(last)

    return isRoot || isRootGlob
  })
}

const expandVariables = (
  text: string,
  variables: Readonly<Record<string, string>>,
): string | undefined => {
  let hasUnknownVariable = false
  const withVariables = text.replace(
    new RegExp(`${EXPANSION}(?:\\{(\\w+)\\}|(\\w+))`, 'g'),
    (match, braced: string | undefined, plain: string | undefined) => {
      const value = variables[braced ?? plain ?? '']
      if (value === undefined) hasUnknownVariable = true

      return value ?? match
    },
  )
  const home = variables.HOME
  const expanded =
    home !== undefined && (withVariables === '~' || withVariables.startsWith('~/'))
      ? `${home}${withVariables.slice(1)}`
      : withVariables

  return hasUnknownVariable || expanded.includes(EXPANSION) ? undefined : expanded
}

const absoluteCwd = (cwd: Cwd, startDir: string | undefined): string | undefined => {
  if (cwd.kind === 'absolute') return cwd.path
  if (cwd.kind === 'unknown' || startDir === undefined) return undefined

  return asAbsolute(normalizePath(`${startDir}/${cwd.relative}`))
}

export const processCwd = (cwd: Cwd, startDir: string | undefined): ProcessCwd => {
  if (cwd.kind === 'unknown') return { isKnown: false }
  if (cwd.kind === 'absolute') return { isKnown: true, path: cwd.path }
  if (startDir === undefined) {
    return { isKnown: true, path: cwd.relative === '' ? undefined : cwd.relative }
  }

  return { isKnown: true, path: absoluteCwd(cwd, startDir) }
}

export const resolvePath = (path: string, cwd: Cwd, context: PathContext): string | undefined => {
  const expanded = expandVariables(path, context.variables)
  if (expanded === undefined) return undefined
  if (expanded.startsWith('/')) return asAbsolute(normalizePath(expanded))

  const base = absoluteCwd(cwd, context.startDir)

  return base === undefined ? undefined : asAbsolute(normalizePath(`${base}/${expanded}`))
}

export const isWithin = (
  path: string,
  cwd: Cwd,
  directories: readonly string[],
  context: PathContext,
): boolean => {
  const resolved = resolvePath(path, cwd, context)

  return resolved !== undefined && directories.some(directory => isUnderDirectory(resolved, directory))
}

const joinRelative = (base: string, next: string): string => {
  const segments = base === '' ? [] : base.split('/')

  for (const segment of next.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..' && segments.length > 0 && segments.at(-1) !== '..') segments.pop()
    else segments.push(segment)
  }

  return segments.join('/')
}

export const changeDirectory = (
  cwd: Cwd,
  target: string | undefined,
  context: PathContext,
): Cwd => {
  const expanded = expandVariables(target ?? '~', context.variables)

  if (expanded === undefined || expanded === '-') return UNKNOWN_CWD
  if (expanded.startsWith('/')) return { kind: 'absolute', path: asAbsolute(normalizePath(expanded)) }
  if (cwd.kind === 'unknown') return UNKNOWN_CWD

  if (cwd.kind === 'absolute') {
    return { kind: 'absolute', path: asAbsolute(normalizePath(`${cwd.path}/${expanded}`)) }
  }

  return { kind: 'start', relative: joinRelative(cwd.relative, expanded) }
}

export const isSameCwd = (first: Cwd, second: Cwd): boolean => {
  if (first.kind === 'start' && second.kind === 'start') return first.relative === second.relative
  if (first.kind === 'absolute' && second.kind === 'absolute') return first.path === second.path

  return first.kind === 'unknown' && second.kind === 'unknown'
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

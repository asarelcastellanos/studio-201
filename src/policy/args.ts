import { EXPANSION } from '../shell'

export const NO_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set()

export const isUnresolved = (text: string): boolean => text.includes(EXPANSION)

export const positionalArgs = (
  args: readonly string[],
  optionsWithValue: ReadonlySet<string>,
): string[] => {
  const positionals: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg.startsWith('-')) index += optionsWithValue.has(arg) ? 1 : 0
    else positionals.push(arg)
  }

  return positionals
}

export const optionValue = (
  args: readonly string[],
  names: readonly string[],
): string | undefined => {
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

export const parseGit = (args: readonly string[]) => {
  const directories: string[] = []
  const configOverrides: string[] = []
  let index = 0

  while (args[index]?.startsWith('-')) {
    const option = args[index] ?? ''
    const value = args[index + 1] ?? ''

    if (option === '-C') directories.push(value)
    if (option === '-c') configOverrides.push(value)
    index += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(option) ? 2 : 1
  }

  return {
    subcommand: args[index],
    rest: args.slice(index + 1),
    globalArgs: args.slice(0, index),
    directories,
    configOverrides,
  }
}

export const withoutRepoFlag = (args: readonly string[]) => {
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

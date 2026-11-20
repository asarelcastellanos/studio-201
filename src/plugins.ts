export type Installed = { id: string; version: string; enabled: boolean; scope: string; installPath: string }

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const toInstalled = (value: unknown): Installed | undefined => {
  if (!isRecord(value)) return undefined
  const { id, version, enabled, scope, installPath } = value
  const isEntry = typeof id === 'string' && typeof version === 'string' && typeof enabled === 'boolean' && typeof scope === 'string' && typeof installPath === 'string'
  return isEntry ? { id, version, enabled, scope, installPath } : undefined
}

export const parseInstalled = (stdout: string): Installed[] => {
  try {
    const parsed: unknown = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed.flatMap(entry => toInstalled(entry) ?? []) : []
  } catch {
    return []
  }
}

export const pluginName = (id: string) => id.split('@')[0]

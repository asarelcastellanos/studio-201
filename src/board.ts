import type { EngineInterface, On } from 'claude-code'

type Engine = Pick<EngineInterface, 'fs' | 'process' | 'session'>
export type BoardConfig = { owner: string; repo: string; projectNumber: number; boardUrl: string }

const NO_BOARD = 'No board for this repo. Run scripts/new-project.sh.'

export const parseBoardConfig = (text: string): BoardConfig | undefined => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null) return undefined
  const { owner, repo, projectNumber, boardUrl } = Object.fromEntries(Object.entries(data))
  if (typeof owner !== 'string' || typeof repo !== 'string' || typeof boardUrl !== 'string') return undefined
  if (typeof projectNumber !== 'number') return undefined
  return { owner, repo, projectNumber, boardUrl }
}

export const readBoardConfig = async ($: Engine): Promise<BoardConfig | undefined> => {
  try {
    const root = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: await $.session.cwd(), timeoutMs: 10_000 })
    if (root.exitCode !== 0) return undefined
    return parseBoardConfig(await $.fs.read(`${root.stdout.trim()}/.studio/config.json`))
  } catch {
    return undefined
  }
}

export const registerBoard = (on: On) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: "Print this repo's GitHub board link" })
    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    const config = await readBoardConfig($)
    return { text: config?.boardUrl ?? NO_BOARD }
  })
}

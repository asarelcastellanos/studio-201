export const NO_BOARD = 'No board yet. Run scripts/new-project.sh in this repo.'

const CONFIG_PATH = '.studio/config.json'

export type BoardIo = {
	read: (path: string) => Promise<string | undefined>
}

export function boardConfigPath(cwd: string): string {
	return `${cwd.replace(/\/+$/, '')}/${CONFIG_PATH}`
}

export function parseBoardUrl(raw: string): string | undefined {
	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch {
		return undefined
	}
	if (typeof data !== 'object' || data === null || !('board' in data)) return undefined
	const url = data.board
	return typeof url === 'string' && url.trim() !== '' ? url.trim() : undefined
}

export async function readBoardUrl(io: BoardIo, cwd: string): Promise<string | undefined> {
	const raw = await io.read(boardConfigPath(cwd))
	return raw === undefined ? undefined : parseBoardUrl(raw)
}

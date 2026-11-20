import { applyPlan, planAgentsCopy } from './setup'
import type { Paths, SetupIo } from './setup'

export const PLUGIN_ID = 'studio-201@studio-201'
export const MARKETPLACE = 'studio-201'
export const RELOAD_HINT = 'Run /reload-plugins to apply.'

export type RunResult = { exitCode: number; stdout: string; stderr: string }

export type UpdateIo = {
	run: (argv: readonly string[]) => Promise<RunResult>
	files: SetupIo
	setupDone: () => Promise<boolean>
	requestReload: () => void
	log: (text: string) => void
}

export type MarketplaceSource = { source: string; path: string | undefined }
export type Installed = { version: string; installPath: string }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonArray(raw: string): Record<string, unknown>[] | undefined {
	try {
		const data: unknown = JSON.parse(raw)
		return Array.isArray(data) ? data.filter(isRecord) : undefined
	} catch {
		return undefined
	}
}

export function parseMarketplace(raw: string): MarketplaceSource | undefined {
	const entry = parseJsonArray(raw)?.find(item => item.name === MARKETPLACE)
	if (entry === undefined || typeof entry.source !== 'string') return undefined
	return { source: entry.source, path: typeof entry.path === 'string' ? entry.path : undefined }
}

export function parseInstalled(raw: string): Installed | undefined {
	const entry = parseJsonArray(raw)?.find(item => item.id === PLUGIN_ID)
	if (entry === undefined || typeof entry.version !== 'string' || typeof entry.installPath !== 'string') return undefined
	return { version: entry.version, installPath: entry.installPath }
}

function output(result: RunResult): string {
	return [result.stdout, result.stderr]
		.map(text => text.trim())
		.filter(text => text !== '')
		.join('\n')
}

function lastLine(result: RunResult): string {
	return output(result).split('\n').at(-1) ?? ''
}

async function step(io: UpdateIo, argv: readonly string[], quiet = false): Promise<RunResult> {
	if (!quiet) io.log(`$ ${argv.join(' ')}`)
	const result = await io.run(argv)
	const text = output(result)
	if (text !== '' && !quiet) io.log(text)
	return result
}

async function must(io: UpdateIo, argv: readonly string[], what: string, quiet = false): Promise<RunResult> {
	const result = await step(io, argv, quiet)
	if (result.exitCode === 0) return result
	const detail = lastLine(result)
	throw new Error(`${what} failed with exit code ${result.exitCode}${detail === '' ? '' : `: ${detail}`}`)
}

async function readInstalled(io: UpdateIo): Promise<Installed> {
	const result = await must(io, ['claude', 'plugin', 'list', '--json'], 'Reading the installed plugins', true)
	const installed = parseInstalled(result.stdout)
	if (installed === undefined) throw new Error(`${PLUGIN_ID} is not installed. Run: claude plugin install ${MARKETPLACE}`)
	return installed
}

type Pull = { line: string; moved: boolean }

async function pullClone(io: UpdateIo, dir: string): Promise<Pull | undefined> {
	const inside = await io.run(['git', '-C', dir, 'rev-parse', '--is-inside-work-tree'])
	if (inside.exitCode !== 0) return undefined
	const branch = (await must(io, ['git', '-C', dir, 'branch', '--show-current'], 'Reading the branch', true)).stdout.trim()
	if (branch === '') throw new Error(`${dir} is not on a branch, so it cannot be pulled. The working tree and the installed plugin are unchanged.`)
	const before = (await must(io, ['git', '-C', dir, 'rev-parse', 'HEAD'], 'Reading HEAD', true)).stdout.trim()
	const pull = await step(io, ['git', '-C', dir, 'pull', '--ff-only'])
	if (pull.exitCode !== 0) {
		const detail = lastLine(pull)
		throw new Error(
			`git pull --ff-only failed on ${branch} in ${dir}${detail === '' ? '' : `: ${detail}`}\nThe working tree and the installed plugin are unchanged. Fix the clone and run the update again.`,
		)
	}
	const after = (await must(io, ['git', '-C', dir, 'rev-parse', 'HEAD'], 'Reading HEAD', true)).stdout.trim()
	if (before === after) return { line: `Pulled ${branch} in ${dir}: already up to date.`, moved: false }
	return { line: `Pulled ${branch} in ${dir}: ${before.slice(0, 7)} to ${after.slice(0, 7)}.`, moved: true }
}

async function refreshAgents(io: UpdateIo, paths: Paths, installed: Installed): Promise<void> {
	if (!(await io.setupDone())) return
	const sourcePath = `${installed.installPath}/AGENTS.md`
	const source = await io.files.read(sourcePath)
	if (source === undefined) throw new Error(`${sourcePath} is missing, so AGENTS.md was not refreshed`)
	const copy = planAgentsCopy(source, await io.files.read(paths.agentsCopy), paths)
	if (copy === undefined) return
	await applyPlan(io.files, { steps: [copy], notes: [] })
	io.log(copy.lines.join('\n'))
}

export async function runUpdate(io: UpdateIo, paths: Paths): Promise<string> {
	const before = await readInstalled(io)
	io.log(`Installed version: v${before.version}`)
	const marketplaces = await must(io, ['claude', 'plugin', 'marketplace', 'list', '--json'], 'Reading the marketplaces', true)
	const marketplace = parseMarketplace(marketplaces.stdout)
	if (marketplace === undefined) {
		throw new Error(`The ${MARKETPLACE} marketplace is not configured. Run: claude plugin marketplace add <path to your clone>`)
	}
	const pull =
		marketplace.source === 'directory' && marketplace.path !== undefined ? await pullClone(io, marketplace.path) : undefined
	if (pull !== undefined) io.log(pull.line)
	await must(io, ['claude', 'plugin', 'marketplace', 'update', MARKETPLACE], 'Updating the marketplace')
	await must(io, ['claude', 'plugin', 'update', PLUGIN_ID, '--yes'], 'Updating the plugin')
	const after = await readInstalled(io)
	io.log(`Installed version now: v${after.version}`)
	await refreshAgents(io, paths, after)
	const lines = pull === undefined ? [] : [pull.line]
	if (before.version === after.version && pull?.moved !== true) {
		return [...lines, `Studio 201 is up to date (v${after.version}).`].join('\n')
	}
	const headline =
		before.version === after.version
			? `Pulled new commits. The version stays v${after.version}.`
			: `Updated v${before.version} to v${after.version}.`
	io.requestReload()
	lines.push(`${headline} ${RELOAD_HINT}`)
	return lines.join('\n')
}

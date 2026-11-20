import { applySteps, planAgentsCopy } from './setup'
import type { Paths, SetupIo } from './setup'

const PLUGIN_ID = 'studio-201@studio-201'
const MARKETPLACE = 'studio-201'
const RELOAD_HINT = 'Run /reload-plugins to apply.'
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' }
const ALLOWED_BRANCH = /^(main|release\/v.+)$/

type RunResult = { exitCode: number; stdout: string; stderr: string }

export type UpdateIo = {
	run: (argv: readonly string[], env?: Readonly<Record<string, string>>) => Promise<RunResult>
	files: SetupIo
	setupDone: () => Promise<boolean>
	log: (text: string) => void
}

type MarketplaceSource = { source: string; path: string | undefined }
type Installed = { version: string; installPath: string; readFromFolder: string | undefined }

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

function parseMarketplace(raw: string): MarketplaceSource | undefined {
	const entry = parseJsonArray(raw)?.find(item => item.name === MARKETPLACE)
	if (entry === undefined || typeof entry.source !== 'string') return undefined
	return { source: entry.source, path: typeof entry.path === 'string' ? entry.path : undefined }
}

function parseInstalled(raw: string): Installed | undefined {
	const entry = parseJsonArray(raw)?.find(item => item.id === PLUGIN_ID)
	if (entry === undefined || typeof entry.version !== 'string' || typeof entry.installPath !== 'string') return undefined
	return {
		version: entry.version,
		installPath: entry.installPath,
		readFromFolder: typeof entry.readFromFolder === 'string' ? entry.readFromFolder : undefined,
	}
}

function output(result: RunResult): string {
	return [result.stdout, result.stderr]
		.map(text => text.trim())
		.filter(text => text !== '')
		.join('\n')
}

function failureDetail(result: RunResult): string {
	const lines = output(result)
		.split('\n')
		.map(line => line.trim())
		.filter(line => line !== '')
	const errors = lines.filter(line => line.startsWith('fatal:') || line.startsWith('error:'))
	return errors.length > 0 ? errors.join(' ') : (lines[0] ?? '')
}

async function step(io: UpdateIo, argv: readonly string[], quiet = false, env?: Readonly<Record<string, string>>): Promise<RunResult> {
	if (!quiet) io.log(`$ ${argv.join(' ')}`)
	const result = await io.run(argv, env)
	const text = output(result)
	if (text !== '' && !quiet) io.log(text)
	return result
}

async function must(
	io: UpdateIo,
	argv: readonly string[],
	what: string,
	quiet = false,
	env?: Readonly<Record<string, string>>,
): Promise<RunResult> {
	const result = await step(io, argv, quiet, env)
	if (result.exitCode === 0) return result
	const detail = failureDetail(result)
	throw new Error(`${what} failed with exit code ${result.exitCode}${detail === '' ? '' : `: ${detail}`}`)
}

async function readInstalled(io: UpdateIo): Promise<Installed> {
	const result = await must(io, ['claude', 'plugin', 'list', '--json'], 'Reading the installed plugins', true)
	const installed = parseInstalled(result.stdout)
	if (installed === undefined) throw new Error(
			`${PLUGIN_ID} is not installed. Run: claude plugin marketplace add <clone>, then claude plugin install ${PLUGIN_ID}`,
		)
	return installed
}

type Pull = { line: string; moved: boolean }

async function pullClone(io: UpdateIo, dir: string): Promise<Pull> {
	const git = (args: readonly string[], what: string) => must(io, ['git', '-C', dir, ...args], what, true, GIT_ENV)
	const inside = await io.run(['git', '-C', dir, 'rev-parse', '--is-inside-work-tree'], GIT_ENV)
	if (inside.exitCode !== 0) return { line: 'Not a git checkout, nothing pulled.', moved: false }
	const current = (await git(['branch', '--show-current'], 'Reading the branch')).stdout.trim()
	if (!ALLOWED_BRANCH.test(current)) {
		throw new Error(
			`The clone at ${dir} is on ${current === '' ? '(detached HEAD)' : current}. Switch it to main or release/v<version>, then run the update again.`,
		)
	}
	const before = (await git(['rev-parse', 'HEAD'], 'Reading HEAD')).stdout.trim()
	const pull = await step(io, ['git', '-C', dir, 'pull', '--ff-only'], false, GIT_ENV)
	if (pull.exitCode !== 0) {
		const detail = failureDetail(pull)
		throw new Error(
			`git pull --ff-only failed on ${current} in ${dir}${detail === '' ? '' : `: ${detail}`}\nThe working tree and the installed plugin are unchanged. Fix the clone and run the update again.`,
		)
	}
	const after = (await git(['rev-parse', 'HEAD'], 'Reading HEAD')).stdout.trim()
	if (before === after) return { line: `Pulled ${current} in ${dir}: already up to date.`, moved: false }
	return { line: `Pulled ${current} in ${dir}: ${before.slice(0, 7)} to ${after.slice(0, 7)}.`, moved: true }
}

async function refreshAgents(io: UpdateIo, paths: Paths, installed: Installed): Promise<void> {
	if (!(await io.setupDone())) return
	const sourcePath = `${installed.readFromFolder ?? installed.installPath}/AGENTS.md`
	const source = await io.files.read(sourcePath)
	if (source === undefined) throw new Error(`${sourcePath} is missing, so AGENTS.md was not refreshed`)
	const copy = planAgentsCopy(source, await io.files.read(paths.agentsCopy), paths)
	if (copy === undefined) return
	await applySteps(io.files, [copy])
	io.log(copy.lines.join('\n'))
}

export async function runUpdate(io: UpdateIo, paths: Paths): Promise<string> {
	const before = await readInstalled(io)
	io.log(`Installed version: v${before.version}`)
	const marketplaces = await must(io, ['claude', 'plugin', 'marketplace', 'list', '--json'], 'Reading the marketplaces', true)
	const marketplace = parseMarketplace(marketplaces.stdout)
	if (marketplace === undefined) {
		throw new Error(`The ${MARKETPLACE} marketplace is not configured. Run: claude plugin marketplace add <clone>`)
	}
	const pull =
		marketplace.source === 'directory' && marketplace.path !== undefined ? await pullClone(io, marketplace.path) : undefined
	if (pull !== undefined) io.log(pull.line)
	const done: string[] = pull?.moved === true ? [pull.line] : []
	try {
		await must(io, ['claude', 'plugin', 'marketplace', 'update', MARKETPLACE], 'Updating the marketplace')
		await must(io, ['claude', 'plugin', 'update', PLUGIN_ID, '--yes'], 'Updating the plugin')
		done.push('The plugin update ran.')
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
		lines.push(`${headline} ${RELOAD_HINT}`)
		return lines.join('\n')
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new Error(done.length === 0 ? message : `${message}\nAlready done: ${done.join(' ')}`)
	}
}

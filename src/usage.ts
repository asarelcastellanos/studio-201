import type { ModelUsage } from 'claude-code'

export type Totals = Map<string, number>

export function addTurn(totals: Totals, model: string, usage: ModelUsage): void {
	const sum =
		usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
	const key = modelKey(model)
	totals.set(key, (totals.get(key) ?? 0) + sum)
}

export function sumTokens(totals: Totals): number {
	let sum = 0
	for (const tokens of totals.values()) sum += tokens
	return sum
}

const FAMILY = '(opus|sonnet|haiku)'
const VERSION = '(\\d+(?:-\\d+)?)'

function parseModel(model: string): { family: string; version: string } | undefined {
	const id = model.replace(/-\d{8}$/, '')
	const match = new RegExp(`${FAMILY}-${VERSION}(?!\\d)`, 'i').exec(id)
	if (match?.[1] !== undefined && match[2] !== undefined) return { family: match[1], version: match[2] }
	const old = new RegExp(`${VERSION}-${FAMILY}`, 'i').exec(id)
	if (old?.[1] !== undefined && old[2] !== undefined) return { family: old[2], version: old[1] }
	return undefined
}

export function modelKey(model: string): string {
	const parsed = parseModel(model)
	return parsed === undefined ? model : `${parsed.family.toLowerCase()} ${parsed.version.replace('-', '.')}`
}

export function modelLabel(model: string): string {
	const parsed = parseModel(model)
	if (parsed === undefined) return model
	const family = parsed.family.toLowerCase()
	return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${parsed.version.replace('-', '.')}`
}

export function formatTokens(count: number): string {
	if (count < 1000) return String(Math.round(count))
	if (count < 1_000_000) return `${trim(count / 1000)}k`
	return `${trim(count / 1_000_000)}M`
}

function trim(value: number): string {
	return value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '')
}

export function formatCost(usd: number): string {
	return `$${usd.toFixed(2)}`
}

const CLOCK = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Los_Angeles',
	hour: 'numeric',
	minute: '2-digit',
	hour12: true,
})

export function formatClock(at: number): string {
	return CLOCK.format(at)
}

export function formatBar(percent: number, width: number): string {
	const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
	return '█'.repeat(filled) + '░'.repeat(width - filled)
}

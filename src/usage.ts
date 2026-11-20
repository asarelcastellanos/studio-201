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

export function modelKey(model: string): string {
	const family = /(opus|sonnet|haiku)/i.exec(model)?.[1]
	return family === undefined ? model : family.toLowerCase()
}

export function modelLabel(model: string): string {
	const match = /(opus|sonnet|haiku)-(\d+(?:-\d+)?)/i.exec(model)
	if (match === null || match[1] === undefined || match[2] === undefined) return model
	const family = match[1].toLowerCase()
	return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${match[2].replace('-', '.')}`
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

export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000))
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function formatBar(percent: number, width: number): string {
	const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
	return '█'.repeat(filled) + '░'.repeat(width - filled)
}

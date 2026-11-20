import type { SessionRateLimit } from 'claude-code'

import { forecast } from './forecast'
import type { Forecast, Reading, Window } from './forecast'

export type StoredReading = Reading & { resetsAt?: number }

export type Stored = Record<Window, StoredReading[]>

export type WindowView = {
	label: Window
	percent: number | undefined
	resetsAt: number | undefined
	forecast: Forecast | { kind: 'no-reset' } | undefined
}

const WEEK = 7 * 24 * 60 * 60 * 1000

const WINDOWS: readonly Window[] = ['5h', '7d']

const KINDS = new Map<string, Window>([
	['five_hour', '5h'],
	['seven_day', '7d'],
])

function emptyReadings(): Stored {
	return { '5h': [], '7d': [] }
}

function isReading(value: unknown): value is StoredReading {
	return (
		typeof value === 'object' &&
		value !== null &&
		'at' in value &&
		'percent' in value &&
		typeof value.at === 'number' &&
		typeof value.percent === 'number'
	)
}

function normalize(r: StoredReading): StoredReading {
	return typeof r.resetsAt === 'number' ? { at: r.at, percent: r.percent, resetsAt: r.resetsAt } : { at: r.at, percent: r.percent }
}

function resetOf(limit: SessionRateLimit): number | undefined {
	if (limit.resetsAt === undefined) return undefined
	const parsed = Date.parse(limit.resetsAt)
	return Number.isNaN(parsed) ? undefined : parsed
}

export function parseReadings(value: unknown): Stored {
	const parsed = emptyReadings()
	if (typeof value !== 'object' || value === null) return parsed
	for (const window of WINDOWS) {
		if (window in value) {
			const list: unknown = (value as Record<string, unknown>)[window]
			if (Array.isArray(list)) parsed[window] = list.filter(isReading).map(normalize)
		}
	}
	return parsed
}

function limitFor(limits: readonly SessionRateLimit[], window: Window): SessionRateLimit | undefined {
	return limits.find((limit) => KINDS.get(limit.kind) === window)
}

export function recordReadings(stored: Stored, limits: readonly SessionRateLimit[], now: number): Stored {
	const next = emptyReadings()
	for (const window of WINDOWS) {
		const kept = stored[window].filter((r) => r.at > now - WEEK && r.at <= now)
		const limit = limitFor(limits, window)
		if (limit === undefined) {
			next[window] = kept
			continue
		}
		const last = kept.at(-1)
		const resetsAt = resetOf(limit)
		const reading: StoredReading =
			resetsAt === undefined
				? { at: now, percent: limit.percentUsed }
				: { at: now, percent: limit.percentUsed, resetsAt }
		const changed = resetsAt !== undefined && last?.resetsAt !== undefined && last.resetsAt !== resetsAt
		next[window] = changed ? [reading] : [...kept, reading]
	}
	return next
}

export function viewWindows(stored: Stored, limits: readonly SessionRateLimit[], now: number): WindowView[] {
	return WINDOWS.map((window) => {
		const limit = limitFor(limits, window)
		if (limit === undefined) return { label: window, percent: undefined, resetsAt: undefined, forecast: undefined }
		const resetsAt = resetOf(limit)
		return {
			label: window,
			percent: limit.percentUsed,
			resetsAt,
			forecast:
				resetsAt === undefined
					? { kind: 'no-reset' }
					: forecast(stored[window], window, resetsAt, now),
		}
	})
}

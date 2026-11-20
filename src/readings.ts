import type { SessionRateLimit } from 'claude-code'

import { forecast } from './forecast'
import type { Forecast, Reading, Window } from './forecast'

export type Stored = Record<Window, Reading[]>

export type WindowView = {
	label: Window
	percent: number | undefined
	resetsAt: number | undefined
	forecast: Forecast | undefined
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

function isReading(value: unknown): value is Reading {
	return (
		typeof value === 'object' &&
		value !== null &&
		'at' in value &&
		'percent' in value &&
		typeof value.at === 'number' &&
		typeof value.percent === 'number'
	)
}

export function parseReadings(value: unknown): Stored {
	const parsed = emptyReadings()
	if (typeof value !== 'object' || value === null) return parsed
	for (const window of WINDOWS) {
		if (window in value) {
			const list: unknown = (value as Record<string, unknown>)[window]
			if (Array.isArray(list)) parsed[window] = list.filter(isReading).map((r) => ({ at: r.at, percent: r.percent }))
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
		const reading = { at: now, percent: limit.percentUsed }
		next[window] = last !== undefined && limit.percentUsed < last.percent ? [reading] : [...kept, reading]
	}
	return next
}

export function viewWindows(stored: Stored, limits: readonly SessionRateLimit[], now: number): WindowView[] {
	return WINDOWS.map((window) => {
		const limit = limitFor(limits, window)
		if (limit === undefined) return { label: window, percent: undefined, resetsAt: undefined, forecast: undefined }
		const parsed = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)
		const resetsAt = Number.isNaN(parsed) ? undefined : parsed
		return {
			label: window,
			percent: limit.percentUsed,
			resetsAt,
			forecast:
				resetsAt === undefined
					? { kind: 'not-enough-data' }
					: forecast(stored[window], window, resetsAt, now),
		}
	})
}

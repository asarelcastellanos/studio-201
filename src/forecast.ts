export type Reading = { at: number; percent: number }

export type Window = '5h' | '7d'

export type Forecast = { kind: 'hit'; at: number } | { kind: 'fine' } | { kind: 'not-enough-data' }

const MINUTE = 60_000

const HOUR = 60 * MINUTE

const SPAN: Record<Window, number> = { '5h': 30 * MINUTE, '7d': 24 * HOUR }

const MIN_READINGS = 3

export function forecast(readings: readonly Reading[], window: Window, resetAt: number, now: number): Forecast {
	const recent = readings.filter((r) => r.at >= now - SPAN[window] && r.at <= now)
	if (recent.length === 0) return { kind: 'not-enough-data' }

	const latest = recent.reduce((a, b) => (b.at >= a.at ? b : a))
	if (latest.percent >= 100) return latest.at < resetAt ? { kind: 'hit', at: latest.at } : { kind: 'fine' }
	if (recent.length < MIN_READINGS) return { kind: 'not-enough-data' }

	const meanAt = recent.reduce((sum, r) => sum + r.at, 0) / recent.length
	const meanPercent = recent.reduce((sum, r) => sum + r.percent, 0) / recent.length
	const spread = recent.reduce((sum, r) => sum + (r.at - meanAt) ** 2, 0)
	if (spread === 0) return { kind: 'not-enough-data' }

	const slope = recent.reduce((sum, r) => sum + (r.at - meanAt) * (r.percent - meanPercent), 0) / spread
	if (slope <= 0) return { kind: 'fine' }

	const hitAt = Math.max(Math.round(meanAt + (100 - meanPercent) / slope), now)
	return hitAt < resetAt ? { kind: 'hit', at: hitAt } : { kind: 'fine' }
}

const PACIFIC = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Los_Angeles',
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	hour12: true,
	timeZoneName: 'short',
})

export function formatPacific(at: number): string {
	const parts = Object.fromEntries(PACIFIC.formatToParts(at).map((p) => [p.type, p.value]))
	return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`
}

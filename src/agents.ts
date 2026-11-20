import type { AgentInfo } from 'claude-code'

import { turnTokens } from './usage'

export type AgentRow = {
	id: string
	role: string
	task: string
	model: string | undefined
	startTime: number
	tokens: number
}

export const FINISHED_KEPT = 50

export type FinishedRow = AgentRow & { endTime: number }

const DONE: ReadonlySet<AgentInfo['status']> = new Set(['completed', 'failed', 'killed'])

export function roleName(type: string): string {
	const bare = type.slice(type.lastIndexOf(':') + 1).replaceAll('-', ' ')
	return bare.charAt(0).toUpperCase() + bare.slice(1)
}

export function agentRow(info: AgentInfo): AgentRow {
	return {
		id: info.id,
		role: roleName(info.type),
		task: info.description,
		model: info.model,
		startTime: info.startTime,
		tokens:
			info.usage === undefined ? info.tokenCount : info.usage.reduce((sum, usage) => sum + turnTokens(usage), 0),
	}
}

export function isFinished(info: AgentInfo): boolean {
	return DONE.has(info.status)
}

export function longestFirst(rows: readonly AgentRow[]): AgentRow[] {
	return [...rows].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
}

export function trackFinished(
	finished: Map<string, FinishedRow>,
	list: readonly AgentInfo[],
	now: number,
): void {
	for (const info of list) {
		if (!isFinished(info)) finished.delete(info.id)
		else if (!finished.has(info.id)) finished.set(info.id, { ...agentRow(info), endTime: now })
	}
	const surplus = finished.size - FINISHED_KEPT
	if (surplus > 0) {
		const oldest = [...finished.values()].sort((a, b) => a.endTime - b.endTime).slice(0, surplus)
		for (const row of oldest) finished.delete(row.id)
	}
}

export function runningRows(finished: ReadonlyMap<string, FinishedRow>, list: readonly AgentInfo[]): AgentRow[] {
	return longestFirst(list.filter((info) => !isFinished(info) && !finished.has(info.id)).map(agentRow))
}

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000))
	if (total < 60) return `${total}s`
	const minutes = Math.floor(total / 60)
	const seconds = String(total % 60).padStart(2, '0')
	if (minutes < 60) return `${minutes}m ${seconds}s`
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function fit(text: string, width: number): string {
	const chars = [...text.replace(/\s+/g, ' ').trim()]
	return chars.length <= width ? chars.join('') : `${chars.slice(0, width - 1).join('')}…`
}

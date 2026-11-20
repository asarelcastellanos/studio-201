import type { Elements } from 'claude-code'

import { formatDuration, fit } from './agents'
import type { AgentRow, FinishedRow } from './agents'
import type { WindowView } from './readings'
import { formatBar, formatClock, formatCost, formatDay, formatTokens, modelKey, modelLabel } from './usage'

export type PaneData = {
	model: string
	policyOn: boolean
	byModel: ReadonlyMap<string, number>
	startedAt: number
	tokens: number
	cost: { usd: number; hasUnknownPrice?: true } | undefined
	context: { tokens?: number; window: number; percent?: number }
	windows: readonly WindowView[]
	agents: AgentsView
	columns?: number
}

export type AgentsView = {
	running: readonly AgentRow[]
	finished: readonly FinishedRow[]
	viewing: string | undefined
	showAllRunning: boolean
	finishedOpen: boolean
	showAllFinished: boolean
	view: (id: string) => void
	back: () => void
	toggleRunning: () => void
	toggleFinished: () => void
	toggleFinishedMore: () => void
}

type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const BAR_WIDTH = 10
const LIMIT_BAR_WIDTH = 8
const NAME_WIDTH = 11
const PANE_WIDTH = 20
const BREAKPOINTS = { medium: 32, wide: 48 }
const BAR_GROWTH_STEP = 4
const BAR_GROWTH_MAX = 6
const SEPARATOR = ' · '
const MIN_TASK = 12
const INDENT = 2
const RUNNING_SHOWN = 5
const FINISHED_SHOWN = 5

type Layout = { tier: 'narrow' | 'medium' | 'wide'; width: number }

function layoutFor(columns: number | undefined): Layout {
	if (columns === undefined) return { tier: 'narrow', width: PANE_WIDTH }
	if (columns < BREAKPOINTS.medium) return { tier: 'narrow', width: Math.max(PANE_WIDTH, columns) }
	return { tier: columns < BREAKPOINTS.wide ? 'medium' : 'wide', width: columns }
}

function barWidth(base: number, layout: Layout): number {
	if (layout.tier !== 'wide') return base
	return base + Math.min(BAR_GROWTH_MAX, Math.floor((layout.width - BREAKPOINTS.wide) / BAR_GROWTH_STEP))
}

function pack(parts: readonly string[], width: number, separator = SEPARATOR): string[] {
	const lines: string[] = []
	for (const part of parts) {
		const last = lines.length - 1
		const joined = last < 0 ? part : `${lines[last]}${separator}${part}`
		if (last >= 0 && [...joined].length <= width) lines[last] = joined
		else lines.push(part)
	}
	return lines.map((line) => fit(line, width))
}

function rowLine(mark: string, role: string, task: string, tail: string, width: number): string | undefined {
	const room = width - [...mark].length - [...role].length - [...tail].length - 2 * SEPARATOR.length
	if (room < MIN_TASK) return undefined
	return `${mark}${role}${SEPARATOR}${fit(task, room)}${SEPARATOR}${tail}`
}

function heading(label: string): string {
	return `── ${label} ${'─'.repeat(Math.max(2, 16 - label.length))}`
}

function costLine(cost: PaneData['cost']): string {
	if (cost === undefined) return 'no cost yet'
	return cost.usd === 0 ? 'no charge' : `est. ${formatCost(cost.usd)}`
}

function windowLines(ui: Ui, view: WindowView, layout: Layout): JSX.Element[] {
	const { Text } = ui
	const key = view.label
	if (view.percent === undefined) return [<Text key={key}>{view.label} no reading yet</Text>]
	const bar = formatBar(view.percent, barWidth(LIMIT_BAR_WIDTH, layout))
	const level = `${view.label} ${bar} ${Math.round(view.percent)}%`
	const pace = view.forecast
	if (layout.tier !== 'narrow') {
		const parts = view.resetsAt === undefined ? [level] : [level, `resets ${formatDay(view.resetsAt)} ${formatClock(view.resetsAt)} PT`]
		const lines = pack(parts, layout.width)
		if (pace?.kind === 'hit') {
			lines.push(...pack(['on pace to hit limit', `${formatDay(pace.at)} ${formatClock(pace.at)} PT`], layout.width, ' '))
		} else if (pace?.kind === 'fine') {
			lines.push('on pace: ok')
		} else if (pace?.kind === 'not-enough-data') {
			lines.push(...pack(['pace: not enough', 'readings yet'], layout.width, ' '))
		}
		return lines.map((line, index) => <Text key={`${key}-${index}`}>{line}</Text>)
	}
	const lines = [<Text key={`${key}-bar`}>{level}</Text>]
	if (view.resetsAt !== undefined) {
		lines.push(<Text key={`${key}-day`}>resets {formatDay(view.resetsAt)}</Text>)
		lines.push(<Text key={`${key}-time`}>  {formatClock(view.resetsAt)} PT</Text>)
	}
	if (pace?.kind === 'hit') {
		lines.push(<Text key={`${key}-pace`}>on pace to hit</Text>)
		lines.push(<Text key={`${key}-hit-day`}>limit {formatDay(pace.at)}</Text>)
		lines.push(<Text key={`${key}-hit-time`}>  {formatClock(pace.at)} PT!</Text>)
	} else if (pace?.kind === 'fine') {
		lines.push(<Text key={`${key}-pace`}>on pace: ok</Text>)
	} else if (pace?.kind === 'not-enough-data') {
		lines.push(<Text key={`${key}-pace`}>pace: not enough</Text>)
		lines.push(<Text key={`${key}-data`}>  readings yet</Text>)
	}
	return lines
}

function modelName(model: string | undefined, width: number): string {
	return fit(model === undefined ? '-' : modelLabel(model), width - INDENT)
}

function runningLines(ui: Ui, view: AgentsView, row: AgentRow, layout: Layout): JSX.Element[] {
	const { Button, Text } = ui
	const key = `run-${row.id}`
	const mark = view.viewing === row.id ? '●' : '▸'
	const model = modelName(row.model, layout.width)
	const tail = [model, `since ${formatClock(row.startTime)}`, `${formatTokens(row.tokens)} tok`].join(SEPARATOR)
	const single = layout.tier === 'wide' ? rowLine(`${mark} `, row.role, row.task, tail, layout.width) : undefined
	if (single !== undefined) {
		return [
			<Button key={key} plain onPress={() => view.view(row.id)}>
				{single}
			</Button>,
		]
	}
	const head = (
		<Button key={key} plain onPress={() => view.view(row.id)}>
			{`${mark} ${fit(row.role, layout.width - INDENT)}`}
		</Button>
	)
	const task = <Text key={`${key}-task`}>{`  ${fit(row.task, layout.width - INDENT)}`}</Text>
	if (layout.tier !== 'narrow') {
		const packed = pack([model, `since ${formatClock(row.startTime)}`, `${formatTokens(row.tokens)} tokens`], layout.width - INDENT)
		return [head, task, ...packed.map((line, index) => <Text key={`${key}-tail-${index}`}>{`  ${line}`}</Text>), <Text key={`${key}-gap`}> </Text>]
	}
	return [
		head,
		task,
		<Text key={`${key}-model`}>{`  ${model}`}</Text>,
		<Text key={`${key}-since`}>{`  since ${formatClock(row.startTime)}`}</Text>,
		<Text key={`${key}-tokens`}>{`  ${formatTokens(row.tokens)} tokens`}</Text>,
		<Text key={`${key}-gap`}> </Text>,
	]
}

function finishedLines(ui: Ui, row: FinishedRow, layout: Layout): JSX.Element[] {
	const { Text } = ui
	const key = `done-${row.id}`
	const model = modelName(row.model, layout.width)
	const ran = `ran ${formatDuration(row.endTime - row.startTime)}`
	const tail = [model, ran, `${formatTokens(row.tokens)} tok`].join(SEPARATOR)
	const single = layout.tier === 'wide' ? rowLine('✓ ', row.role, row.task, tail, layout.width) : undefined
	if (single !== undefined) return [<Text key={key}>{single}</Text>]
	const head = <Text key={key}>{`✓ ${fit(row.role, layout.width - INDENT)}`}</Text>
	const task = <Text key={`${key}-task`}>{`  ${fit(row.task, layout.width - INDENT)}`}</Text>
	if (layout.tier !== 'narrow') {
		const packed = pack([model, ran, `${formatTokens(row.tokens)} tokens`], layout.width - INDENT)
		return [head, task, ...packed.map((line, index) => <Text key={`${key}-tail-${index}`}>{`  ${line}`}</Text>), <Text key={`${key}-gap`}> </Text>]
	}
	return [
		head,
		task,
		<Text key={`${key}-model`}>{`  ${model}`}</Text>,
		<Text key={`${key}-ran`}>{`  ${ran}`}</Text>,
		<Text key={`${key}-tokens`}>{`  ${formatTokens(row.tokens)} tokens`}</Text>,
		<Text key={`${key}-gap`}> </Text>,
	]
}

function agentsSection(ui: Ui, view: AgentsView, layout: Layout): JSX.Element[] {
	const { Button, Text } = ui
	const shown = view.showAllRunning ? view.running : view.running.slice(0, RUNNING_SHOWN)
	const hidden = view.running.length - shown.length
	const lines: JSX.Element[] = [
		<Text key="agents-head" dimColor>
			{heading('Agents')}
		</Text>,
		<Text key="agents-count">{view.running.length === 0 ? 'none running' : `${view.running.length} running`}</Text>,
		<Text key="agents-top"> </Text>,
	]
	for (const row of shown) lines.push(...runningLines(ui, view, row, layout))
	if (hidden > 0 || view.showAllRunning) {
		lines.push(
			<Button key="agents-more" plain onPress={view.toggleRunning}>
				{view.showAllRunning ? 'Show fewer ‹' : `Show ${hidden} more ›`}
			</Button>,
			<Text key="agents-more-gap"> </Text>,
		)
	}
	if (view.finished.length > 0) {
		lines.push(
			<Button key="agents-finished" plain onPress={view.toggleFinished}>
				{`${view.finished.length} finished ${view.finishedOpen ? '⌄' : '›'}`}
			</Button>,
		)
		if (view.finishedOpen) {
			lines.push(<Text key="agents-finished-gap"> </Text>)
			const doneShown = view.showAllFinished ? view.finished : view.finished.slice(0, FINISHED_SHOWN)
			const doneHidden = view.finished.length - doneShown.length
			for (const row of doneShown) lines.push(...finishedLines(ui, row, layout))
			if (doneHidden > 0 || view.showAllFinished) {
				lines.push(
					<Button key="agents-finished-more" plain onPress={view.toggleFinishedMore}>
						{view.showAllFinished ? 'Show fewer ‹' : `Show ${doneHidden} more ›`}
					</Button>,
				)
			}
		}
	}
	return lines
}

export function renderPane(ui: Ui, data: PaneData, board?: JSX.Element) {
	const { Box, Button, Text } = ui
	const ranked = [...data.byModel].sort((a, b) => b[1] - a[1])
	const percent = data.context.percent
	const layout = layoutFor(data.columns)
	const compact = layout.tier !== 'narrow'
	const sessionParts = [`since ${formatClock(data.startedAt)}`, `${formatTokens(data.tokens)} chat`, costLine(data.cost)]
	if (data.cost?.hasUnknownPrice === true) sessionParts.push('unknown model price')
	const contextTokens = `${data.context.tokens === undefined ? '-' : formatTokens(data.context.tokens)} / ${formatTokens(data.context.window)}`
	const contextBar = percent === undefined ? undefined : `${formatBar(percent, barWidth(BAR_WIDTH, layout))} ${Math.round(percent)}%`
	return (
		<Box flexDirection="column">
			{data.agents.viewing === undefined ? null : (
				<Button key="back" plain onPress={data.agents.back}>
					‹ Back to main
				</Button>
			)}
			<Box flexDirection="column">
				<Text bold>Studio 201</Text>
				<Text>{modelLabel(data.model)}</Text>
				{board}
			</Box>
			<Text> </Text>
			<Text dimColor>{heading('Session')}</Text>
			{compact ? (
				pack(sessionParts, layout.width).map((line, index) => <Text key={`session-${index}`}>{line}</Text>)
			) : (
				<Box flexDirection="column">
					<Text>since {formatClock(data.startedAt)}</Text>
					<Text>{formatTokens(data.tokens)} chat</Text>
					<Text>{costLine(data.cost)}</Text>
					{data.cost?.hasUnknownPrice === true ? <Text>unknown model price</Text> : null}
				</Box>
			)}
			<Text> </Text>
			<Text dimColor>{heading('Context')}</Text>
			{compact ? (
				pack([contextBar ?? 'no reading yet', contextTokens], layout.width).map((line, index) => (
					<Text key={`context-${index}`}>{line}</Text>
				))
			) : (
				<Box flexDirection="column">
					<Text>{contextBar ?? 'no reading yet'}</Text>
					<Text>{contextTokens}</Text>
				</Box>
			)}
			<Text> </Text>
			<Text dimColor>{heading('Usage')}</Text>
			{data.windows.map((view, index) => (
				<Box key={view.label} flexDirection="column">
					{index === 0 ? null : <Text> </Text>}
					{windowLines(ui, view, layout)}
				</Box>
			))}
			<Text> </Text>
			<Text dimColor>{heading('Policy')}</Text>
			<Text>{data.policyOn ? 'on' : 'off'}</Text>
			{ranked.length === 0 ? null : <Text> </Text>}
			{ranked.length === 0 ? null : <Text dimColor>chat tokens</Text>}
			{ranked.map(([model, tokens]) => (
				<Text key={model}>
					{modelKey(model).padEnd(NAME_WIDTH)}
					{formatTokens(tokens)}
				</Text>
			))}
			<Text> </Text>
			{agentsSection(ui, data.agents, layout)}
		</Box>
	)
}

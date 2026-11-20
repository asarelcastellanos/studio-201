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
const INDENT = 2
const RUNNING_SHOWN = 5
const FINISHED_SHOWN = 5

function heading(label: string): string {
	return `── ${label} ${'─'.repeat(Math.max(2, 16 - label.length))}`
}

function costLine(cost: PaneData['cost']): string {
	if (cost === undefined) return 'no cost yet'
	return cost.usd === 0 ? 'no charge' : `est. ${formatCost(cost.usd)}`
}

function windowLines(ui: Ui, view: WindowView): JSX.Element[] {
	const { Text } = ui
	const key = view.label
	if (view.percent === undefined) return [<Text key={key}>{view.label} no reading yet</Text>]
	const lines = [
		<Text key={`${key}-bar`}>
			{view.label} {formatBar(view.percent, LIMIT_BAR_WIDTH)} {Math.round(view.percent)}%
		</Text>,
	]
	if (view.resetsAt !== undefined) {
		lines.push(<Text key={`${key}-day`}>resets {formatDay(view.resetsAt)}</Text>)
		lines.push(<Text key={`${key}-time`}>  {formatClock(view.resetsAt)} PT</Text>)
	}
	const pace = view.forecast
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

function modelName(model: string | undefined): string {
	return fit(model === undefined ? '-' : modelLabel(model), PANE_WIDTH - INDENT)
}

function runningLines(ui: Ui, view: AgentsView, row: AgentRow): JSX.Element[] {
	const { Button, Text } = ui
	const key = `run-${row.id}`
	const mark = view.viewing === row.id ? '●' : '▸'
	return [
		<Button key={key} plain onPress={() => view.view(row.id)}>
			{`${mark} ${fit(row.role, PANE_WIDTH - INDENT)}`}
		</Button>,
		<Text key={`${key}-task`}>{`  ${fit(row.task, PANE_WIDTH - INDENT)}`}</Text>,
		<Text key={`${key}-model`}>{`  ${modelName(row.model)}`}</Text>,
		<Text key={`${key}-since`}>{`  since ${formatClock(row.startTime)}`}</Text>,
		<Text key={`${key}-tokens`}>{`  ${formatTokens(row.tokens)} tokens`}</Text>,
		<Text key={`${key}-gap`}> </Text>,
	]
}

function finishedLines(ui: Ui, row: FinishedRow): JSX.Element[] {
	const { Text } = ui
	const key = `done-${row.id}`
	return [
		<Text key={key}>{`✓ ${fit(row.role, PANE_WIDTH - INDENT)}`}</Text>,
		<Text key={`${key}-task`}>{`  ${fit(row.task, PANE_WIDTH - INDENT)}`}</Text>,
		<Text key={`${key}-model`}>{`  ${modelName(row.model)}`}</Text>,
		<Text key={`${key}-ran`}>{`  ran ${formatDuration(row.endTime - row.startTime)} · ${formatTokens(row.tokens)}`}</Text>,
		<Text key={`${key}-gap`}> </Text>,
	]
}

function agentsSection(ui: Ui, view: AgentsView): JSX.Element[] {
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
	for (const row of shown) lines.push(...runningLines(ui, view, row))
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
			for (const row of doneShown) lines.push(...finishedLines(ui, row))
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
			<Text>since {formatClock(data.startedAt)}</Text>
			<Text>{formatTokens(data.tokens)} chat</Text>
			<Text>{costLine(data.cost)}</Text>
			{data.cost?.hasUnknownPrice === true ? <Text>unknown model price</Text> : null}
			<Text> </Text>
			<Text dimColor>{heading('Context')}</Text>
			{percent === undefined ? (
				<Text>no reading yet</Text>
			) : (
				<Text>
					{formatBar(percent, BAR_WIDTH)} {Math.round(percent)}%
				</Text>
			)}
			<Text>
				{data.context.tokens === undefined ? '-' : formatTokens(data.context.tokens)} / {formatTokens(data.context.window)}
			</Text>
			<Text> </Text>
			<Text dimColor>{heading('Usage')}</Text>
			{data.windows.map((view, index) => (
				<Box key={view.label} flexDirection="column">
					{index === 0 ? null : <Text> </Text>}
					{windowLines(ui, view)}
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
			{agentsSection(ui, data.agents)}
		</Box>
	)
}

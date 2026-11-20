import type { Elements } from 'claude-code'

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
}

type Ui = Pick<Elements['terminal'], 'Box' | 'Text'>

const BAR_WIDTH = 10
const LIMIT_BAR_WIDTH = 8
const NAME_WIDTH = 11

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

export function renderPane(ui: Ui, data: PaneData, board?: JSX.Element) {
	const { Box, Text } = ui
	const ranked = [...data.byModel].sort((a, b) => b[1] - a[1])
	const percent = data.context.percent
	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Text bold>Studio 201</Text>
				<Text>{modelLabel(data.model)}</Text>
				{board}
			</Box>
			<Text> </Text>
			<Text dimColor>{heading('Session')}</Text>
			<Text>since {formatClock(data.startedAt)}</Text>
			<Text>{formatTokens(data.tokens)} since load</Text>
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
			{ranked.map(([model, tokens]) => (
				<Text key={model}>
					{modelKey(model).padEnd(NAME_WIDTH)}
					{formatTokens(tokens)}
				</Text>
			))}
		</Box>
	)
}

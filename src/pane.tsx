import type { Elements } from 'claude-code'

import { formatBar, formatCost, formatDuration, formatTokens, modelKey, modelLabel } from './usage'

export type PaneData = {
	model: string
	policyOn: boolean
	byModel: ReadonlyMap<string, number>
	elapsedMs: number
	tokens: number
	costUsd: number | undefined
	context: { tokens?: number; window: number; percent?: number }
}

type Ui = Pick<Elements['terminal'], 'Box' | 'Text'>

const BAR_WIDTH = 10
const NAME_WIDTH = 7

function heading(label: string): string {
	return `── ${label} ${'─'.repeat(Math.max(2, 16 - label.length))}`
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
			<Text>{formatDuration(data.elapsedMs)}</Text>
			<Text>{formatTokens(data.tokens)} tokens</Text>
			<Text>{data.costUsd === undefined ? 'no cost yet' : formatCost(data.costUsd)}</Text>
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

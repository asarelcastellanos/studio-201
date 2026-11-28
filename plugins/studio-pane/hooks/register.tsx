import type { Register } from 'claude-code'

const PANE = 'studio'
const TITLE = 'Studio'
const FIVE_H = 5 * 3600000
const SEVEN_D = 7 * 86400000
const REFRESH_MS = 5 * 60000

type Window = { used: number; resetsAt?: number }
type Reading = { at: number; five?: Window; seven?: Window }
type Price = { input: number; output: number; read: number; write5m: number; write1h: number }

const CLAUDE_PRICES: Record<string, Price> = {
  'claude-fable-5-2': { input: 8, output: 40, read: 0.2, write5m: 10, write1h: 16 },
  'claude-opus-5-5': { input: 4, output: 20, read: 0.2, write5m: 5, write1h: 8 },
  'claude-sonnet-5-5': { input: 2, output: 10, read: 0.1, write5m: 2.5, write1h: 4 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, read: 0.01, write5m: 0.125, write1h: 0.2 },
}

const CODEX_PRICES: Record<string, Price> = {
  'gpt-6.2-astra': { input: 8, output: 40, read: 0.4, write5m: 10, write1h: 10 },
  'gpt-6.2-sol': { input: 2, output: 10, read: 0.1, write5m: 2.5, write1h: 2.5 },
  'gpt-6-luna': { input: 0.1, output: 0.5, read: 0.01, write5m: 0.125, write1h: 0.125 },
}

const AWK_LIB = `
function num(s, k,   i, r) { i = index(s, "\\"" k "\\":"); if (!i) return ""; r = substr(s, i + length(k) + 3); return r + 0 }
function str(s, k,   i, r) { i = index(s, "\\"" k "\\":\\""); if (!i) return ""; r = substr(s, i + length(k) + 4); return substr(r, 1, index(r, "\\"") - 1) }
`

const CLAUDE_AWK = `${AWK_LIB}
/"type":"assistant"/ && /"usage":/ {
  m = substr($0, index($0, "\\"message\\":"))
  u = substr($0, index($0, "\\"usage\\":"))
  print str($0, "timestamp") "\\t" str(m, "model") "\\t" str(m, "id") "\\t" num(u, "input_tokens") "\\t" num(u, "cache_read_input_tokens") "\\t" num(u, "output_tokens") "\\t" num(u, "ephemeral_5m_input_tokens") "\\t" num(u, "ephemeral_1h_input_tokens") "\\t" num(u, "cache_creation_input_tokens")
}`

const CODEX_AWK = `${AWK_LIB}
FNR == 1 { print "F" }
/"type":"turn_context"/ { print "M\\t" str($0, "model"); next }
/"type":"token_count"/ {
  t = index($0, "\\"total_token_usage\\"")
  tot = t ? substr($0, t) : ""
  p = index($0, "\\"primary\\":{"); pr = p ? substr($0, p) : ""
  s = index($0, "\\"secondary\\":{"); se = s ? substr($0, s) : ""
  print "T\\t" str($0, "timestamp") "\\t" (t ? num(tot, "input_tokens") : "") "\\t" (t ? num(tot, "cached_input_tokens") : "") "\\t" (t ? num(tot, "output_tokens") : "") "\\t" (t ? num(tot, "cache_write_input_tokens") : "") "\\t" (p ? num(pr, "used_percent") : "") "\\t" (p ? num(pr, "window_minutes") : "") "\\t" (p ? num(pr, "resets_at") : "") "\\t" (s ? num(se, "used_percent") : "") "\\t" (s ? num(se, "window_minutes") : "") "\\t" (s ? num(se, "resets_at") : "")
}`

type ClaudeData = { cost: number; readings: Reading[] }
type CodexData = { seenAt?: number; cost: number; latest?: Reading; readings: Reading[]; asOf?: number }

let claudeData: ClaudeData = { cost: 0, readings: [] }
let codexData: CodexData = { cost: 0, readings: [] }
let busy = false
let refreshing = false
let started = false

const n = (s: string | undefined) => (s === undefined || s === '' ? undefined : Number(s))

const bar = (percent: number, cells: number) => {
  const filled = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const levelColor = (percent: number) =>
  percent >= 85 ? 'error' : percent >= 70 ? 'warning' : undefined

const span = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

const localTime = (at: number) => {
  try {
    return new Date(at).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return new Date(at).toISOString().slice(5, 16).replace('T', ' ')
  }
}

const shortPath = (path: string) => path.replace(/^\/Users\/[^/]+/, '~')

const live = (w: Window | undefined, now: number): Window | undefined =>
  w && w.resetsAt !== undefined && w.resetsAt <= now ? { used: 0 } : w

const forecast = (
  readings: Reading[],
  pick: (r: Reading) => Window | undefined,
  lookback: number,
  now: number,
): number | undefined => {
  const current = readings.length ? pick(readings[readings.length - 1]!) : undefined
  if (!current || current.resetsAt === undefined || current.resetsAt <= now) return undefined
  const same = readings
    .filter(r => {
      const w = pick(r)
      return w && w.resetsAt !== undefined && Math.abs(w.resetsAt - current.resetsAt!) < 120000
    })
    .filter(r => r.at >= now - lookback)
  if (same.length < 2) return undefined
  const first = same[0]!
  const last = same[same.length - 1]!
  const dt = last.at - first.at
  const du = pick(last)!.used - pick(first)!.used
  if (dt < 10 * 60000 || du <= 0) return undefined
  const hit = last.at + ((100 - pick(last)!.used) / du) * dt
  return hit < current.resetsAt ? hit : undefined
}

const priceOf = (table: Record<string, Price>, model: string) =>
  table[model] ?? Object.entries(table).find(([k]) => model.startsWith(k))?.[1]

const readClaudeCost = async ($: any, windowStart: number) => {
  const root = `${(await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout}/.claude/projects`
  const run = await $.process.run(
    ['find', root, '-name', '*.jsonl', '-mmin', '-300', '-exec', 'awk', CLAUDE_AWK, '{}', '+'],
    { timeoutMs: 20000 },
  )
  const byId = new Map<string, string[]>()
  for (const line of run.stdout.split('\n')) {
    const f = line.split('\t')
    if (f.length < 9 || !f[2]) continue
    byId.set(f[2], f)
  }
  let cost = 0
  for (const f of byId.values()) {
    const at = Date.parse(f[0] ?? '')
    if (!(at >= windowStart)) continue
    const price = priceOf(CLAUDE_PRICES, f[1] ?? '')
    if (!price) continue
    const input = n(f[3]) ?? 0
    const read = n(f[4]) ?? 0
    const output = n(f[5]) ?? 0
    const w5 = n(f[6])
    const w1 = n(f[7])
    const created = n(f[8]) ?? 0
    const write5m = w5 ?? (w1 === undefined ? created : 0)
    const write1h = w1 ?? 0
    cost +=
      (input * price.input +
        read * price.read +
        output * price.output +
        write5m * price.write5m +
        write1h * price.write1h) /
      1e6
  }
  return cost
}

const readCodex = async ($: any, now: number): Promise<CodexData> => {
  const root = `${(await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout}/.codex/sessions`
  const exists = await $.fs.exists(root).catch(() => false)
  if (!exists) return { cost: 0, readings: [] }
  const run = await $.process.run(
    ['find', root, '-name', '*.jsonl', '-mtime', '-7', '-exec', 'awk', CODEX_AWK, '{}', '+'],
    { timeoutMs: 20000 },
  )
  const readings: Reading[] = []
  const events: { at: number; model: string; d: number[] }[] = []
  let model = ''
  let prev: number[] | undefined
  for (const line of run.stdout.split('\n')) {
    const f = line.split('\t')
    if (f[0] === 'F') {
      model = ''
      prev = undefined
    } else if (f[0] === 'M') {
      model = f[1] ?? model
    } else if (f[0] === 'T') {
      const at = Date.parse(f[1])
      if (!Number.isFinite(at)) continue
      const totals = [n(f[2]), n(f[3]), n(f[4]), n(f[5])]
      if (totals[0] !== undefined) {
        const cur = totals.map(v => v ?? 0)
        if (prev && cur[0]! >= prev[0]!) {
          const d = cur.map((v, i) => Math.max(0, v - prev![i]!))
          if (d.some(v => v > 0)) events.push({ at, model, d })
        } else if (!prev) {
          events.push({ at, model, d: cur })
        }
        prev = cur
      }
      const win = (used?: number, minutes?: number, resets?: number) =>
        used === undefined ? undefined : { minutes, w: { used, resetsAt: resets ? resets * 1000 : undefined } }
      const a = win(n(f[6]), n(f[7]), n(f[8]))
      const b = win(n(f[9]), n(f[10]), n(f[11]))
      const r: Reading = { at }
      for (const x of [a, b]) {
        if (x?.minutes === 300) r.five = x.w
        if (x?.minutes === 10080) r.seven = x.w
      }
      if (r.five || r.seven) readings.push(r)
    }
  }
  readings.sort((x, y) => x.at - y.at)
  const latest = readings[readings.length - 1]
  const fiveReset = latest?.five?.resetsAt
  const windowStart = fiveReset && fiveReset > now ? fiveReset - FIVE_H : now - FIVE_H
  let cost = 0
  let seenAt: number | undefined
  for (const e of events) {
    seenAt = Math.max(seenAt ?? 0, e.at)
    if (e.at < windowStart) continue
    const price = priceOf(CODEX_PRICES, e.model)
    if (!price) continue
    const [input = 0, cached = 0, output = 0, write = 0] = e.d
    const fresh = Math.max(0, input - cached - write)
    cost += (fresh * price.input + cached * price.read + write * price.write5m + output * price.output) / 1e6
  }
  return { seenAt, cost, latest, readings, asOf: latest?.at }
}

const claudeWindows = (usage: any): Reading => {
  const get = (kind: string): Window | undefined => {
    const r = usage.rateLimits.find((x: any) => x.kind === kind)
    return r ? { used: r.percentUsed, resetsAt: r.resetsAt ? Date.parse(r.resetsAt) : undefined } : undefined
  }
  return { at: 0, five: get('five_hour'), seven: get('seven_day') }
}

const refresh = async ($: any) => {
  if (refreshing) return
  refreshing = true
  try {
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const cw = claudeWindows(usage)
    const stored = ((await $.store.get('claudeReadings')) as Reading[] | undefined) ?? []
    const readings = stored.filter(r => r.at >= now - SEVEN_D - 3600000)
    if (cw.five || cw.seven) readings.push({ at: now, five: cw.five, seven: cw.seven })
    await $.store.set('claudeReadings', readings.slice(-2500))
    const fiveReset = cw.five?.resetsAt
    const windowStart = fiveReset && fiveReset > now ? fiveReset - FIVE_H : now - FIVE_H
    const cost = await readClaudeCost($, windowStart).catch(() => claudeData.cost)
    claudeData = { cost, readings }
    codexData = await readCodex($, now).catch(() => codexData)
  } finally {
    refreshing = false
    $.ui.invalidate('ui.render')
  }
}

const open = ($: any) => $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'studio', description: 'Open the Studio side pane' })
    void open($)
    if (!started) {
      started = true
      $.clock.every(REFRESH_MS, () => void refresh($))
      $.clock.every(15000, () => $.ui.invalidate('ui.render'))
      void refresh($)
    }
    return next(e)
  })

  on('command.run', { command: 'studio' }, async $ => {
    await open($)
    return { text: 'Studio pane opened.' }
  })

  on('turn.start', async ($, e, next) => {
    busy = true
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    busy = false
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.abort', async ($, e, next) => {
    busy = false
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(26, Math.min(40, e.props?.bodyColumns ?? 34))
    const fill = (head: string) => head + ' ' + '─'.repeat(Math.max(2, width - head.length - 1))

    const now = await $.clock.now()
    const [model, usage, repo, cwd, claudeOpen, codexOpen] = await Promise.all([
      $.session.model(),
      $.session.usage(),
      $.session.repo(),
      $.session.cwd(),
      $.store.get('open.claude'),
      $.store.get('open.codex'),
    ])
    const branchRun = await $.process
      .run(['git', '-C', cwd, 'branch', '--show-current'], { timeoutMs: 2000 })
      .catch(() => undefined)
    const branch = branchRun && branchRun.exitCode === 0 ? branchRun.stdout.trim() || 'detached' : 'none'
    const percent = usage.context.percent ?? 0

    const row = (label: string, value: string, tint?: string) => (
      <Text>
        <Text dimColor>{label.padEnd(9)}</Text>
        <Text color={tint as any}>{value}</Text>
      </Text>
    )

    const limitRow = (label: string, w: Window | undefined) =>
      w ? (
        <Text>
          <Text dimColor>{label.padEnd(4)}</Text>
          <Text color={levelColor(w.used) as any}>
            {bar(w.used, 8)} {String(Math.round(w.used)).padStart(3)}%
          </Text>
          <Text dimColor>{w.resetsAt ? `  resets ${span(w.resetsAt - now)}` : ''}</Text>
        </Text>
      ) : (
        <Text dimColor>{label.padEnd(4)}no data</Text>
      )

    const paceRow = (hit: number | undefined) => {
      if (hit === undefined) return null
      const left = hit - now
      const tint = left < 3600000 ? 'error' : left < 86400000 ? 'warning' : undefined
      return (
        <Text color={tint as any}>
          {'    '}out {localTime(hit)} at this pace
        </Text>
      )
    }

    const summary = (five?: Window, seven?: Window) =>
      `5h ${five ? Math.round(five.used) : '?'}% · 7d ${seven ? Math.round(seven.used) : '?'}%`

    const header = (key: string, name: string, isOpen: boolean, five?: Window, seven?: Window) => (
      <Button
        key={key}
        plain
        onPress={async () => {
          await $.store.set(`open.${key}`, !isOpen)
          $.ui.invalidate('ui.render')
        }}
      >
        <Text dimColor>{fill(`${isOpen ? '▾' : '▸'} ${name} ── ${summary(five, seven)}`)}</Text>
      </Button>
    )

    const cw = claudeWindows(usage)
    const cFive = live(cw.five, now)
    const cSeven = live(cw.seven, now)
    const claudeReadings = [...claudeData.readings, { at: now, five: cw.five, seven: cw.seven }]

    const showCodex = codexData.seenAt !== undefined && now - codexData.seenAt < FIVE_H
    const xFive = live(codexData.latest?.five, now)
    const xSeven = live(codexData.latest?.seven, now)

    return (
      <Box flexDirection="column">
        <Text dimColor>{fill('── Session')}</Text>
        <Box flexDirection="row">
          <Text>
            <Text dimColor>{'Context'.padEnd(9)}</Text>
            <Text color={levelColor(percent) as any}>
              {bar(percent, 10)} {Math.round(percent)}%
            </Text>{' '}
          </Text>
          <Button
            key="compact"
            label="Compact"
            variant={percent >= 70 && !busy ? 'primary' : 'secondary'}
            dimColor={busy}
            onPress={async () => {
              if (busy) {
                $.ui.toast('Compact is available once the current turn ends.')
                return
              }
              try {
                const result: any = await $.session.compact()
                if (result?.skip) $.ui.toast('Compact was skipped.')
              } catch {
                $.ui.toast('Compact is available once the current turn ends.')
              }
            }}
          />
        </Box>
        {row('Model', model)}
        {row('Repo', repo?.name ?? 'none')}
        {row('Branch', branch)}
        {row('Folder', shortPath(cwd))}
        {row('Mode', 'none')}
        <Text> </Text>
        {header('claude', 'Claude', claudeOpen === true, cFive, cSeven)}
        {claudeOpen === true && (
          <Box flexDirection="column">
            {limitRow('5h', cFive)}
            {paceRow(forecast(claudeReadings, r => r.five, 3600000, now))}
            {limitRow('7d', cSeven)}
            {paceRow(forecast(claudeReadings, r => r.seven, 86400000, now))}
            <Text>
              <Text dimColor>Cost (at API price), 5h </Text>${claudeData.cost.toFixed(2)}
            </Text>
          </Box>
        )}
        {showCodex && <Text> </Text>}
        {showCodex && header('codex', 'Codex', codexOpen === true, xFive, xSeven)}
        {showCodex && codexOpen === true && (
          <Box flexDirection="column">
            {limitRow('5h', xFive)}
            {paceRow(forecast(codexData.readings, r => r.five, 3600000, now))}
            {limitRow('7d', xSeven)}
            {paceRow(forecast(codexData.readings, r => r.seven, 86400000, now))}
            <Text>
              <Text dimColor>Cost (at API price), 5h </Text>${codexData.cost.toFixed(2)}
            </Text>
            {codexData.asOf !== undefined && (
              <Text dimColor>as of {span(now - codexData.asOf)} ago</Text>
            )}
          </Box>
        )}
      </Box>
    )
  })
}

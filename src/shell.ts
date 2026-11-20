export const EXPANSION = '\u0001'

export type Redirect = { operator: string; target: string; body?: string }

export type SimpleCommand = {
  kind: 'command'
  program: string
  args: readonly string[]
  redirects: readonly Redirect[]
  pipedFrom?: SimpleCommand
}

export type ShellItem =
  | SimpleCommand
  | { kind: 'scope'; items: ShellItem[] }
  | { kind: 'conditional'; items: ShellItem[] }

type ParsedShell = { items: ShellItem[]; isComplete: boolean }

type Word = { text: string; isPlain: boolean }

type Heredoc = { delimiter: string; stripsTabs: boolean; expands: boolean; redirect: Redirect }

type Pending = {
  words: string[]
  redirects: Redirect[]
  isLoopHeader: boolean
  isCaseHeader: boolean
}

type Frame = {
  kind: 'base' | 'conditional' | 'and-or' | 'function'
  items: ShellItem[]
  parent: Frame | undefined
}

const WORD_BREAKS = new Set([' ', '\t', '\n', ';', '&', '|', '(', ')', '<', '>'])
const TEST_WORD_BREAKS = new Set([' ', '\t', '\n', ';'])
const REDIRECT_OPERATORS = ['&>>', '&>', '<<<', '<<-', '<<', '<>', '<&', '<', '>>', '>&', '>|', '>']
const LEADING_KEYWORDS = new Set(['then', 'else', 'elif', 'do', '!'])
const OPENING_KEYWORDS = new Set(['if', 'while', 'until'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const ASSIGNMENT_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*\+?=$/

const newPending = (): Pending => ({
  words: [],
  redirects: [],
  isLoopHeader: false,
  isCaseHeader: false,
})

export const parseShell = (source: string): ParsedShell => {
  const functionNames = new Set<string>()
  const pendingHeredocs: Heredoc[] = []
  let pos = 0
  let isComplete = true
  let emit: (item: ShellItem) => void = () => undefined

  const peek = (offset = 0) => source[pos + offset]

  const skipBlanks = () => {
    while (peek() === ' ' || peek() === '\t') pos += 1
  }

  const readSubstitution = (): string => {
    const items = parseList(')')
    emit({ kind: 'scope', items })

    return `${EXPANSION}()`
  }

  const readBacktick = (): string => {
    let raw = ''
    let isClosed = false
    pos += 1

    while (pos < source.length) {
      const char = source[pos] ?? ''
      const next = peek(1)

      if (char === '\\' && (next === '`' || next === '\\' || next === '$')) {
        raw += next
        pos += 2
      } else if (char === '`') {
        isClosed = true
        pos += 1
        break
      } else {
        raw += char
        pos += 1
      }
    }

    const inner = parseShell(raw)
    if (!isClosed || !inner.isComplete) isComplete = false
    emit({ kind: 'scope', items: inner.items })

    return `${EXPANSION}()`
  }

  const scanGroup = (open: string, close: string) => {
    let depth = 0

    while (pos < source.length) {
      const char = source[pos]

      if (char === '$' && peek(1) === '(' && peek(2) !== '(') {
        pos += 2
        readSubstitution()
        continue
      }

      if (char === '`') {
        readBacktick()
        continue
      }

      pos += 1
      if (char === open) depth += 1
      if (char === close) depth -= 1
      if (depth === 0) return
    }

    isComplete = false
  }

  const readBraceExpansion = (): string => {
    let text = ''
    let depth = 0

    while (pos < source.length) {
      const char = source[pos] ?? ''

      if (char === '$' && peek(1) === '(' && peek(2) !== '(') {
        pos += 2
        text += readSubstitution()
        continue
      }

      if (char === '`') {
        text += readBacktick()
        continue
      }

      pos += char === '\\' ? 2 : 1
      if (char === '{') depth += 1
      if (char === '}') depth -= 1
      text += char
      if (depth === 0) return text
    }

    isComplete = false

    return text
  }

  const readDollar = (): string => {
    const next = peek(1)

    if (next === '(' && peek(2) === '(') {
      pos += 1
      scanGroup('(', ')')

      return EXPANSION
    }

    if (next === '(') {
      pos += 2

      return readSubstitution()
    }

    if (next === '[') {
      pos += 1
      scanGroup('[', ']')

      return EXPANSION
    }

    if (next === '{') {
      pos += 1

      return `${EXPANSION}${readBraceExpansion()}`
    }

    if (next === "'") {
      pos += 2
      let text = ''

      while (pos < source.length && source[pos] !== "'") {
        if (source[pos] === '\\') pos += 1
        text += source[pos] ?? ''
        pos += 1
      }

      if (pos >= source.length) isComplete = false
      pos += 1

      return text
    }

    pos += 1

    return EXPANSION
  }

  const readDoubleQuoted = (): string => {
    let text = ''
    pos += 1

    while (pos < source.length && source[pos] !== '"') {
      const char = source[pos]

      if (char === '\\') {
        const escaped = peek(1) ?? ''
        text += escaped === '\n' ? '' : escaped
        pos += 2
      } else if (char === '$') {
        text += readDollar()
      } else if (char === '`') {
        text += readBacktick()
      } else {
        text += char
        pos += 1
      }
    }

    if (pos >= source.length) isComplete = false
    pos += 1

    return text
  }

  const readArrayLiteral = (): string => {
    let text = '('
    pos += 1

    while (pos < source.length) {
      while (/\s/.test(source[pos] ?? 'x')) pos += 1

      if (source[pos] === ')') {
        pos += 1

        return `${text})`
      }

      const element = readWord(false)
      if (element === undefined) pos += 1
      else text += `${element.text} `
    }

    isComplete = false

    return text
  }

  const readWord = (isInTest: boolean): Word | undefined => {
    const breaks = isInTest ? TEST_WORD_BREAKS : WORD_BREAKS
    let text = ''
    let isPlain = true
    let hasContent = false

    while (pos < source.length) {
      const char = source[pos] ?? ''

      if (char === '(' && ASSIGNMENT_PREFIX.test(text)) {
        text += readArrayLiteral()
        isPlain = false
        continue
      }

      if (breaks.has(char)) break
      hasContent = true

      if (char === '\\') {
        if (peek(1) !== '\n') {
          text += peek(1) ?? ''
          isPlain = false
        }
        pos += 2
      } else if (char === "'") {
        const end = source.indexOf("'", pos + 1)
        if (end === -1) isComplete = false
        const closing = end === -1 ? source.length : end
        text += source.slice(pos + 1, closing)
        pos = closing + 1
        isPlain = false
      } else if (char === '"') {
        text += readDoubleQuoted()
        isPlain = false
      } else if (char === '$') {
        text += readDollar()
        isPlain = false
      } else if (char === '`') {
        text += readBacktick()
        isPlain = false
      } else {
        text += char
        pos += 1
      }
    }

    return hasContent ? { text, isPlain } : undefined
  }

  const readHeredocBody = (heredoc: Heredoc) => {
    const bodyStart = pos

    while (pos < source.length) {
      const found = source.indexOf('\n', pos)
      const lineEnd = found === -1 ? source.length : found
      const line = source.slice(pos, lineEnd)
      const compared = heredoc.stripsTabs ? line.replace(/^\t+/, '') : line

      if (compared === heredoc.delimiter) {
        heredoc.redirect.body = source.slice(bodyStart, pos)
        pos = Math.min(lineEnd + 1, source.length)

        return
      }

      if (heredoc.expands) {
        while (pos < source.length && source[pos] !== '\n') {
          if (source[pos] === '\\') {
            pos += 2
          } else if (source[pos] === '$' && peek(1) === '(' && peek(2) !== '(') {
            pos += 2
            readSubstitution()
          } else if (source[pos] === '`') {
            readBacktick()
          } else {
            pos += 1
          }
        }
      } else {
        pos = lineEnd
      }

      pos = Math.min(pos + 1, source.length)
    }

    heredoc.redirect.body = source.slice(bodyStart)
  }

  const readPendingHeredocs = () => {
    for (const heredoc of pendingHeredocs.splice(0)) readHeredocBody(heredoc)
  }

  const skipCasePattern = () => {
    while (pos < source.length && source[pos] !== ')') {
      const char = source[pos]

      if (char === '$' && peek(1) === '(' && peek(2) !== '(') {
        pos += 2
        readSubstitution()
      } else if (char === '`') {
        readBacktick()
      } else if (char === "'" || char === '"') {
        const end = source.indexOf(char, pos + 1)
        pos = end === -1 ? source.length : end + 1
      } else {
        pos += 1
      }
    }

    pos += 1
  }

  const startsWithOperator = (): string | undefined =>
    REDIRECT_OPERATORS.find(operator => source.startsWith(operator, pos))

  const readRedirectTarget = (): string => {
    skipBlanks()

    if ((peek() === '<' || peek() === '>') && peek(1) === '(') {
      pos += 2

      return readSubstitution()
    }

    return readWord(false)?.text ?? ''
  }

  const readRedirect = (pending: Pending) => {
    const operator = startsWithOperator()
    if (operator === undefined) return

    pos += operator.length

    if (operator === '<<' || operator === '<<-') {
      skipBlanks()
      const delimiter = readWord(false)
      const redirect: Redirect = { operator: '<<', target: delimiter?.text ?? '' }

      pendingHeredocs.push({
        delimiter: delimiter?.text ?? '',
        stripsTabs: operator === '<<-',
        expands: delimiter?.isPlain ?? false,
        redirect,
      })
      pending.redirects.push(redirect)

      return
    }

    pending.redirects.push({ operator, target: readRedirectTarget() })
  }

  const readTestExpression = (pending: Pending) => {
    pending.words.push('[[')

    while (pos < source.length) {
      while (peek() === ' ' || peek() === '\t' || peek() === '\n') pos += 1

      if (source.startsWith(']]', pos)) {
        pos += 2
        pending.words.push(']]')

        return
      }

      const word = readWord(true)
      if (word === undefined) pos += 1
      else pending.words.push(word.text)
    }

    isComplete = false
  }

  function parseList(terminator: ')' | undefined): ShellItem[] {
    const base: Frame = { kind: 'base', items: [], parent: undefined }
    const braces: ('function' | 'group')[] = []
    const savedEmit = emit
    let frame = base
    let pending = newPending()
    let caseDepth = 0
    let expectsCasePattern = false
    let hasFunctionBodyPending = false
    let pipelineStart = 0
    let isInPipeline = false
    let lastCommitted: SimpleCommand | undefined
    let pipeSource: SimpleCommand | undefined
    let isClosed = false

    emit = item => frame.items.push(item)

    const startStatement = () => {
      pipelineStart = frame.items.length
      isInPipeline = false
      lastCommitted = undefined
      pipeSource = undefined
    }

    const pushFrame = (kind: Frame['kind']) => {
      frame = { kind, items: [], parent: frame }
      startStatement()
    }

    const popFrame = () => {
      const { parent } = frame
      if (parent === undefined) return

      parent.items.push(
        frame.kind === 'function'
          ? { kind: 'scope', items: frame.items }
          : { kind: 'conditional', items: frame.items },
      )
      frame = parent
      startStatement()
    }

    const popConditional = () => {
      while (frame.parent !== undefined) {
        const { kind } = frame
        popFrame()
        if (kind === 'conditional') return
      }
    }

    const closeAndOr = () => {
      while (frame.kind === 'and-or') popFrame()
    }

    const wrapComponent = () => {
      const component = frame.items.splice(pipelineStart)
      if (component.length > 0) frame.items.push({ kind: 'scope', items: component })
      pipelineStart = frame.items.length
    }

    const commit = (): SimpleCommand | undefined => {
      const { words, redirects, isLoopHeader, isCaseHeader } = pending
      pending = newPending()
      if (isLoopHeader || isCaseHeader) return undefined

      if (words[0] === 'function') {
        const name = words[1]
        if (name !== undefined) functionNames.add(name)

        return undefined
      }

      const start = words.findIndex(word => !ASSIGNMENT.test(word))
      const [program, ...args] = start === -1 ? [] : words.slice(start)

      if (program === undefined || functionNames.has(program)) {
        if (redirects.length === 0) return undefined
        const bare: SimpleCommand = { kind: 'command', program: '', args: [], redirects }
        emit(bare)

        return bare
      }

      const command: SimpleCommand = { kind: 'command', program, args, redirects }
      if (pipeSource !== undefined) command.pipedFrom = pipeSource
      pipeSource = undefined
      emit(command)

      return command
    }

    const finish = () => {
      const command = commit()
      if (command !== undefined) lastCommitted = command
    }

    const endStatement = () => {
      finish()
      if (isInPipeline) wrapComponent()
      closeAndOr()
      startStatement()
    }

    const pipe = () => {
      finish()
      pipeSource = lastCommitted
      isInPipeline = true
      wrapComponent()
    }

    const andOr = () => {
      finish()
      if (isInPipeline) wrapComponent()
      if (frame.kind !== 'and-or') pushFrame('and-or')
      else startStatement()
    }

    while (pos < source.length) {
      const char = source[pos] ?? ''

      if (char === ' ' || char === '\t') {
        pos += 1
        continue
      }

      if (char === '\\' && peek(1) === '\n') {
        pos += 2
        continue
      }

      if (char === '\n') {
        pos += 1
        endStatement()
        readPendingHeredocs()
        continue
      }

      if (expectsCasePattern) {
        let lookahead = pos
        while (/\s/.test(source[lookahead] ?? 'x')) lookahead += 1
        expectsCasePattern = false

        if (!/^esac(?![\w-])/.test(source.slice(lookahead))) {
          pos = lookahead
          skipCasePattern()
          continue
        }
      }

      if (char === '#') {
        while (pos < source.length && source[pos] !== '\n') pos += 1
        continue
      }

      if (char === ')') {
        pos += 1
        endStatement()

        if (terminator === ')') {
          isClosed = true
          break
        }

        continue
      }

      if (char === ';') {
        pos += 1
        endStatement()

        if (peek() === ';') {
          pos += 1
          if (caseDepth > 0) expectsCasePattern = true
        }

        continue
      }

      if (char === '&' && peek(1) === '&') {
        pos += 2
        andOr()
        continue
      }

      if (char === '|' && peek(1) === '|') {
        pos += 2
        andOr()
        continue
      }

      if (char === '&' && peek(1) !== '>') {
        pos += 1
        endStatement()
        continue
      }

      if (char === '|') {
        pos += peek(1) === '&' ? 2 : 1
        pipe()
        continue
      }

      if (char === '(') {
        if (peek(1) === '(') {
          scanGroup('(', ')')
          continue
        }

        if (pending.words.length > 0 && source.slice(pos + 1).trimStart().startsWith(')')) {
          const name = pending.words[0] === 'function' ? pending.words[1] : pending.words[0]
          if (name !== undefined) functionNames.add(name)
          pos = source.indexOf(')', pos) + 1
          pending = newPending()
          hasFunctionBodyPending = true
          continue
        }

        pos += 1
        finish()
        const items = parseList(')')
        frame.items.push({ kind: 'scope', items })
        continue
      }

      if ((char === '<' || char === '>') && peek(1) === '(') {
        pos += 2
        readSubstitution()
        pending.words.push(`${EXPANSION}()`)
        continue
      }

      if (char === '<' || char === '>' || char === '&') {
        readRedirect(pending)
        continue
      }

      const word = readWord(false)
      if (word === undefined) {
        pos += 1
        continue
      }

      const isLeadingPlain = pending.words.length === 0 && word.isPlain
      const wasFunctionBodyPending = hasFunctionBodyPending
      hasFunctionBodyPending = false

      if (isLeadingPlain && LEADING_KEYWORDS.has(word.text)) continue

      if (isLeadingPlain && OPENING_KEYWORDS.has(word.text)) {
        pushFrame('conditional')
        continue
      }

      if (isLeadingPlain && word.text === '{') {
        braces.push(wasFunctionBodyPending ? 'function' : 'group')
        if (wasFunctionBodyPending) pushFrame('function')
        continue
      }

      if (isLeadingPlain && word.text === '}') {
        endStatement()
        if (braces.pop() === 'function') {
          while (frame.parent !== undefined) {
            const { kind } = frame
            popFrame()
            if (kind === 'function') break
          }
        }
        continue
      }

      if (isLeadingPlain && (word.text === 'fi' || word.text === 'done')) {
        endStatement()
        popConditional()
        continue
      }

      if (isLeadingPlain && word.text === 'esac') {
        caseDepth = Math.max(0, caseDepth - 1)
        expectsCasePattern = false
        endStatement()
        popConditional()
        continue
      }

      if (isLeadingPlain && word.text === '[[') {
        readTestExpression(pending)
        continue
      }

      if (isLeadingPlain && (word.text === 'for' || word.text === 'select')) {
        pending.isLoopHeader = true
        pushFrame('conditional')
      }

      if (isLeadingPlain && word.text === 'case') pending.isCaseHeader = true

      if (pending.isCaseHeader && word.isPlain && word.text === 'in') {
        pending = newPending()
        caseDepth += 1
        expectsCasePattern = true
        pushFrame('conditional')
        continue
      }

      if (pending.words[0] === 'function' && pending.words.length === 2 && word.text === '{') {
        functionNames.add(pending.words[1] ?? '')
        pending = newPending()
        braces.push('function')
        pushFrame('function')
        continue
      }

      const isFileDescriptor =
        word.isPlain && /^\d+$/.test(word.text) && (peek() === '<' || peek() === '>')

      if (!isFileDescriptor) pending.words.push(word.text)
    }

    if (terminator === ')' && !isClosed) isComplete = false

    endStatement()
    while (frame.parent !== undefined) popFrame()
    emit = savedEmit

    return base.items
  }

  const items = parseList(undefined)

  return { items, isComplete }
}

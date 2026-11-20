export type Redirect = { operator: string; target: string }

export type SimpleCommand = {
  program: string
  args: readonly string[]
  redirects: readonly Redirect[]
}

type Word = { text: string; isPlain: boolean }

type Heredoc = { delimiter: string; stripsTabs: boolean; expands: boolean }

type Pending = {
  words: string[]
  redirects: Redirect[]
  isLoopHeader: boolean
  isCaseHeader: boolean
}

type Terminator = ')' | '`' | undefined

const WORD_BREAKS = new Set([' ', '\t', '\n', ';', '&', '|', '(', ')', '<', '>'])
const REDIRECT_OPERATORS = ['&>>', '&>', '<<<', '<<-', '<<', '<>', '<&', '<', '>>', '>&', '>|', '>']
const LEADING_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '{', '!'])
const CLOSING_KEYWORDS = new Set(['fi', 'done', '}'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/

const newPending = (): Pending => ({
  words: [],
  redirects: [],
  isLoopHeader: false,
  isCaseHeader: false,
})

export const parseShell = (source: string): SimpleCommand[] => {
  const commands: SimpleCommand[] = []
  const functionNames = new Set<string>()
  const pendingHeredocs: Heredoc[] = []
  let pos = 0

  const peek = (offset = 0) => source[pos + offset]

  const skipBlanks = () => {
    while (peek() === ' ' || peek() === '\t') pos += 1
  }

  const skipParenGroup = () => {
    let depth = 0

    while (pos < source.length) {
      const char = source[pos]
      pos += 1
      if (char === '(') depth += 1
      if (char === ')') depth -= 1
      if (depth === 0) return
    }
  }

  const readSubstitution = (terminator: ')' | '`'): string => {
    parseList(terminator)

    return terminator === ')' ? '$()' : '`'
  }

  const readBraceExpansion = (): string => {
    let text = ''
    let depth = 0

    while (pos < source.length) {
      const char = source[pos]
      if (char === '$' && peek(1) === '(' && peek(2) !== '(') {
        pos += 2
        text += readSubstitution(')')
        continue
      }
      pos += 1
      if (char === '{') depth += 1
      if (char === '}') depth -= 1
      text += char
      if (depth === 0) break
    }

    return text
  }

  const readDollar = (): string => {
    const next = peek(1)

    if (next === '(' && peek(2) === '(') {
      pos += 1
      skipParenGroup()

      return '$'
    }

    if (next === '(') {
      pos += 2

      return readSubstitution(')')
    }

    if (next === '{') {
      pos += 1

      return `$${readBraceExpansion()}`
    }

    if (next === "'") {
      pos += 2
      let text = ''

      while (pos < source.length && source[pos] !== "'") {
        if (source[pos] === '\\') {
          pos += 1
        }
        text += source[pos] ?? ''
        pos += 1
      }
      pos += 1

      return text
    }

    pos += 1

    return '$'
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
        pos += 1
        text += readSubstitution('`')
      } else {
        text += char
        pos += 1
      }
    }
    pos += 1

    return text
  }

  const readWord = (stopsAtBacktick: boolean): Word | undefined => {
    let text = ''
    let isPlain = true
    let hasContent = false

    while (pos < source.length) {
      const char = source[pos] ?? ''

      if (WORD_BREAKS.has(char) || (stopsAtBacktick && char === '`')) break
      hasContent = true

      if (char === '\\') {
        if (peek(1) !== '\n') {
          text += peek(1) ?? ''
          isPlain = false
        }
        pos += 2
      } else if (char === "'") {
        const end = source.indexOf("'", pos + 1)
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
        pos += 1
        text += readSubstitution('`')
        isPlain = false
      } else {
        text += char
        pos += 1
      }
    }

    return hasContent ? { text, isPlain } : undefined
  }

  const readHeredocBody = (heredoc: Heredoc) => {
    while (pos < source.length) {
      const found = source.indexOf('\n', pos)
      const lineEnd = found === -1 ? source.length : found
      const line = source.slice(pos, lineEnd)
      const compared = heredoc.stripsTabs ? line.replace(/^\t+/, '') : line

      if (compared === heredoc.delimiter) {
        pos = Math.min(lineEnd + 1, source.length)

        return
      }

      if (heredoc.expands) {
        while (pos < source.length && source[pos] !== '\n') {
          if (source[pos] === '\\') {
            pos += 2
          } else if (source[pos] === '$' && peek(1) === '(' && peek(2) !== '(') {
            pos += 2
            readSubstitution(')')
          } else if (source[pos] === '`') {
            pos += 1
            readSubstitution('`')
          } else {
            pos += 1
          }
        }
      } else {
        pos = lineEnd
      }

      pos = Math.min(pos + 1, source.length)
    }
  }

  const readPendingHeredocs = () => {
    for (const heredoc of pendingHeredocs.splice(0)) readHeredocBody(heredoc)
  }

  const skipCasePattern = () => {
    while (pos < source.length && source[pos] !== ')') {
      if (source[pos] === "'" || source[pos] === '"') {
        const end = source.indexOf(source[pos] ?? '', pos + 1)
        pos = end === -1 ? source.length : end + 1
      } else {
        pos += 1
      }
    }
    pos += 1
  }

  const commit = (pending: Pending) => {
    const { words, redirects } = pending
    if (pending.isLoopHeader || pending.isCaseHeader) return

    if (words[0] === 'function') {
      const name = words[1]
      if (name !== undefined) functionNames.add(name)

      return
    }

    const start = words.findIndex(word => !ASSIGNMENT.test(word))
    const [program, ...args] = start === -1 ? [] : words.slice(start)
    const callsFunction = program !== undefined && functionNames.has(program)

    if (program === undefined || callsFunction) {
      if (redirects.length > 0) commands.push({ program: '', args: [], redirects })

      return
    }

    commands.push({ program, args, redirects })
  }

  const startsWithOperator = (): string | undefined =>
    REDIRECT_OPERATORS.find(operator => source.startsWith(operator, pos))

  const readRedirectTarget = (stopsAtBacktick: boolean): string => {
    skipBlanks()

    if ((peek() === '<' || peek() === '>') && peek(1) === '(') {
      pos += 2
      readSubstitution(')')

      return '<()'
    }

    return readWord(stopsAtBacktick)?.text ?? ''
  }

  const readRedirect = (pending: Pending, stopsAtBacktick: boolean) => {
    const operator = startsWithOperator()
    if (operator === undefined) return

    pos += operator.length

    if (operator === '<<' || operator === '<<-') {
      skipBlanks()
      const delimiter = readWord(stopsAtBacktick)
      pendingHeredocs.push({
        delimiter: delimiter?.text ?? '',
        stripsTabs: operator === '<<-',
        expands: delimiter?.isPlain ?? false,
      })
      pending.redirects.push({ operator: '<<', target: delimiter?.text ?? '' })

      return
    }

    pending.redirects.push({ operator, target: readRedirectTarget(stopsAtBacktick) })
  }

  function parseList(terminator: Terminator): void {
    let pending = newPending()
    let caseDepth = 0
    let expectsCasePattern = false
    const stopsAtBacktick = terminator === '`'

    const finish = () => {
      commit(pending)
      pending = newPending()
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
        finish()
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

      if (char === '`' && stopsAtBacktick) {
        pos += 1
        finish()

        return
      }

      if (char === ')') {
        pos += 1
        finish()
        if (terminator === ')') return
        continue
      }

      if (char === ';') {
        pos += 1
        finish()
        if (peek() === ';') {
          pos += 1
          if (caseDepth > 0) expectsCasePattern = true
        }
        continue
      }

      if (char === '&' && peek(1) !== '>') {
        pos += peek(1) === '&' ? 2 : 1
        finish()
        continue
      }

      if (char === '|') {
        pos += peek(1) === '|' || peek(1) === '&' ? 2 : 1
        finish()
        continue
      }

      if (char === '(') {
        if (peek(1) === '(') {
          skipParenGroup()
          continue
        }

        const afterParen = source.slice(pos + 1).trimStart()

        if (pending.words.length > 0 && afterParen.startsWith(')')) {
          const name = pending.words[0] === 'function' ? pending.words[1] : pending.words[0]
          if (name !== undefined) functionNames.add(name)
          pos = source.indexOf(')', pos) + 1
          pending = newPending()
          continue
        }

        pos += 1
        finish()
        parseList(')')
        continue
      }

      if ((char === '<' || char === '>') && peek(1) === '(') {
        pos += 2
        readSubstitution(')')
        pending.words.push('<()')
        continue
      }

      if (char === '<' || char === '>' || char === '&') {
        readRedirect(pending, stopsAtBacktick)
        continue
      }

      const word = readWord(stopsAtBacktick)
      if (word === undefined) {
        pos += 1
        continue
      }

      const isLeadingPlain = pending.words.length === 0 && word.isPlain

      if (isLeadingPlain && LEADING_KEYWORDS.has(word.text)) continue

      if (isLeadingPlain && CLOSING_KEYWORDS.has(word.text)) {
        finish()
        continue
      }

      if (isLeadingPlain && word.text === 'esac') {
        caseDepth = Math.max(0, caseDepth - 1)
        expectsCasePattern = false
        finish()
        continue
      }

      if (isLeadingPlain && (word.text === 'for' || word.text === 'select')) pending.isLoopHeader = true
      if (isLeadingPlain && word.text === 'case') pending.isCaseHeader = true

      if (pending.isCaseHeader && word.isPlain && word.text === 'in') {
        pending = newPending()
        caseDepth += 1
        expectsCasePattern = true
        continue
      }

      if (pending.words[0] === 'function' && pending.words.length === 2 && word.text === '{') {
        functionNames.add(pending.words[1] ?? '')
        pending = newPending()
        continue
      }

      const isFileDescriptor = word.isPlain && /^\d+$/.test(word.text) && (peek() === '<' || peek() === '>')

      if (!isFileDescriptor) pending.words.push(word.text)
    }

    finish()
  }

  parseList(undefined)

  return commands
}

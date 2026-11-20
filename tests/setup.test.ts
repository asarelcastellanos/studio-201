import { expect, test } from 'claude-code/testing'
import { parseInstalled } from '../src/plugins'
import { IMPORT_LINE, addImportLine, workbenchToDisable } from '../src/setup'

type Row = [name: string, before: string, after: string]

const rows: Row[] = [
  ['empty file', '', `${IMPORT_LINE}\n`],
  ['other content kept', '# Mine\n\nBe brief.\n', `# Mine\n\nBe brief.\n${IMPORT_LINE}\n`],
  ['no trailing newline', '# Mine', `# Mine\n${IMPORT_LINE}\n`],
  ['line already there', `# Mine\n${IMPORT_LINE}\nMore.\n`, `# Mine\n${IMPORT_LINE}\nMore.\n`],
]

test('the import line is added once and nothing else changes', () => {
  for (const [name, before, after] of rows) {
    expect([name, addImportLine(before)]).toEqual([name, after])
    expect([name, addImportLine(addImportLine(before))]).toEqual([name, after])
  }
})

test('only enabled workbench monitor and model-policy plugins are picked', () => {
  const entry = (id: string, enabled = true) => ({ id, version: '0.1.0', enabled, scope: 'session', installPath: '/x' })
  const listed = JSON.stringify([
    entry('session-monitor@inline'),
    entry('model-policy@claude-workbench'),
    entry('session-coach@inline'),
    entry('model-policy@inline', false),
    { id: 'broken' },
  ])
  expect(workbenchToDisable(parseInstalled(listed)).map(found => found.id)).toEqual(['session-monitor@inline', 'model-policy@claude-workbench'])
  expect(parseInstalled('not json')).toEqual([])
})

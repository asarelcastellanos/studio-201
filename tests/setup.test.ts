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

test('workbench plugins are split into disable and skipped by scope', () => {
  const entry = (id: string, scope: string, enabled = true) => ({ id, version: '0.1.0', enabled, scope, installPath: '/x' })
  const listed = JSON.stringify([
    entry('session-monitor@inline', 'session'),
    entry('model-policy@claude-workbench', 'user'),
    entry('model-policy@claude-workbench', 'project'),
    entry('session-monitor@claude-workbench', 'local'),
    entry('session-coach@inline', 'session'),
    entry('model-policy@inline', 'session', false),
    { id: 'broken' },
  ])
  const { disable, skipped } = workbenchToDisable(parseInstalled(listed))
  expect(disable.map(found => `${found.id} ${found.scope}`)).toEqual(['session-monitor@inline session', 'model-policy@claude-workbench user'])
  expect(skipped.map(found => `${found.id} ${found.scope}`)).toEqual(['model-policy@claude-workbench project', 'session-monitor@claude-workbench local'])
  expect(parseInstalled('not json')).toEqual([])
})

import { expect, test } from 'claude-code/testing'
import { parseBoardConfig } from '../src/board'

type Row = [name: string, text: string, expected: 'valid' | 'invalid']

const valid = { owner: 'me', repo: 'app', projectNumber: 3, boardUrl: 'https://github.com/users/me/projects/3/views/2' }

const rows: Row[] = [
  ['all fields', JSON.stringify(valid), 'valid'],
  ['extra field', JSON.stringify({ ...valid, extra: 1 }), 'valid'],
  ['no boardUrl', JSON.stringify({ ...valid, boardUrl: undefined }), 'invalid'],
  ['no owner', JSON.stringify({ ...valid, owner: undefined }), 'invalid'],
  ['projectNumber as text', JSON.stringify({ ...valid, projectNumber: '3' }), 'invalid'],
  ['empty object', '{}', 'invalid'],
  ['null', 'null', 'invalid'],
  ['array', '[]', 'invalid'],
  ['bad JSON', '{"owner":', 'invalid'],
  ['empty file', '', 'invalid'],
]

test('a board config needs owner, repo, projectNumber and boardUrl', () => {
  for (const [name, text, expected] of rows) {
    const config = parseBoardConfig(text)
    expect([name, config === undefined ? 'invalid' : 'valid']).toEqual([name, expected])
  }
  expect(parseBoardConfig(JSON.stringify(valid))).toEqual(valid)
})

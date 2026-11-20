import { expect, test } from 'claude-code/testing'
import { describeUpdate, readVersion } from '../src/update'

test('readVersion reads plugin.json and rejects anything else', () => {
  expect(readVersion('{"name":"studio-201","version":"0.1.0"}')).toBe('0.1.0')
  expect(readVersion('{"name":"studio-201"}')).toBeUndefined()
  expect(readVersion('{"version":1}')).toBeUndefined()
  expect(readVersion('not json')).toBeUndefined()
})

test('describeUpdate reports old and new versions', () => {
  expect(describeUpdate({ from: '0.1.0', to: '0.2.0', reloaded: true })).toBe('Updated v0.1.0 to v0.2.0 and reloaded plugins.')
  expect(describeUpdate({ from: '0.1.0', to: '0.2.0', reloaded: false })).toBe('Updated v0.1.0 to v0.2.0. Run /reload-plugins to apply.')
  expect(describeUpdate({ from: '0.2.0', to: '0.2.0', reloaded: false })).toBe('Studio 201 v0.2.0 is already the latest.')
})

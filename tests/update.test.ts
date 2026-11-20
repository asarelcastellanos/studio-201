import { expect, test } from 'claude-code/testing'
import { describeUpdate, readVersion } from '../src/update'

test('readVersion reads plugin.json and rejects anything else', () => {
  expect(readVersion('{"name":"studio-201","version":"0.1.0"}')).toBe('0.1.0')
  expect(readVersion('{"name":"studio-201"}')).toBeUndefined()
  expect(readVersion('{"version":1}')).toBeUndefined()
  expect(readVersion('not json')).toBeUndefined()
})

test('describeUpdate reports old and new versions', () => {
  expect(describeUpdate({ from: '0.1.0', to: '0.2.0', agentsFailed: false })).toBe("Updated v0.1.0 to v0.2.0. Run /reload-plugins if the new version isn't active.")
  expect(describeUpdate({ from: '0.1.0', to: '0.2.0', agentsFailed: true })).toBe(
    "Updated v0.1.0 to v0.2.0. Could not refresh the AGENTS.md copy. Run /reload-plugins if the new version isn't active.",
  )
  expect(describeUpdate({ from: '0.2.0', to: '0.2.0', agentsFailed: false })).toBe('Studio 201 v0.2.0 is already the latest.')
})

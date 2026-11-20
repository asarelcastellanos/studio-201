import type { On } from 'claude-code'
import { firstRun, runSetup } from './setup'
import { runUpdate } from './update'

const USAGE = 'Usage: /studio setup, /studio update'

export const parseSubcommand = (args: string) => {
  const [word] = args.trim().split(/\s+/)
  return word === 'setup' || word === 'update' ? word : undefined
}

const attempt = (job: Promise<string | undefined>) => job.catch(error => `Failed: ${error instanceof Error ? error.message : String(error)}`)

export const registerStudio = (on: On) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'studio', description: 'Set up or update Studio 201', argumentHint: '[setup|update]' })
    const settled = await next(e)
    void attempt(firstRun($)).then(text => text && $.ui.toast(text))
    return settled
  })

  on('command.run', { command: 'studio' }, async ($, e) => {
    const sub = parseSubcommand(e.args)
    if (sub === undefined) return { text: USAGE }
    return { text: await attempt(sub === 'setup' ? runSetup($) : runUpdate($)) }
  })
}

import type { Register } from 'claude-code'
import { registerPolicy } from '../src/policy'
import { registerReadOnlyCheck } from '../src/readonly'
import { registerStudio } from '../src/studio'

export const register: Register = on => {
  registerPolicy(on)
  registerReadOnlyCheck(on)
  registerStudio(on)
}

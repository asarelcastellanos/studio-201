import type { Register } from 'claude-code'
import { registerPolicy } from '../src/policy'

export const register: Register = on => {
  registerPolicy(on)
}

export type PolicyOn = boolean

declare module 'claude-code' {
	interface PluginState {
		'studio-201': {
			policy: PolicyOn
		}
	}
}

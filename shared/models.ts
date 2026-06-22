export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'openai' | 'anthropic' | 'google' | 'local'

export interface AgentModelDefinition {
	name: AgentModelName
	id: string
	provider: AgentModelProvider

	// Overrides the default thinking behavior for that provider
	thinking?: boolean

	// Whether this model supports assistant message prefill (ending messages with an assistant turn)
	supportsPrefill?: boolean
}

export const AGENT_MODEL_DEFINITIONS = {
	// Anthropic models
	'claude-sonnet-4-6': {
		name: 'claude-sonnet-4-6',
		id: 'claude-sonnet-4-6',
		provider: 'anthropic',
		supportsPrefill: false,
	},

	'claude-sonnet-4-5': {
		name: 'claude-sonnet-4-5',
		id: 'claude-sonnet-4-5',
		provider: 'anthropic',
	},

	'claude-opus-4-5': {
		name: 'claude-opus-4-5',
		id: 'claude-opus-4-5',
		provider: 'anthropic',
	},

	// Google models
	'gemini-3-pro-preview': {
		name: 'gemini-3-pro-preview',
		id: 'gemini-3-pro-preview',
		provider: 'google',
		thinking: true,
	},

	// gemini 3 flash is fastest, and quite good
	'gemini-3-flash-preview': {
		name: 'gemini-3-flash-preview',
		id: 'gemini-3-flash-preview',
		provider: 'google',
	},

	// OpenAI models
	'gpt-5.2-2025-12-11': {
		name: 'gpt-5.2-2025-12-11',
		id: 'gpt-5.2-2025-12-11',
		provider: 'openai',
	},

	// Local model served by koboldcpp over its OpenAI-compatible endpoint.
	// `id` is a don't-care: koboldcpp serves whatever GGUF is loaded and reports
	// its own model id back. Prefill is off; small local models do not handle an
	// assistant-prefill turn reliably.
	local: {
		name: 'local',
		id: 'local',
		provider: 'local',
		supportsPrefill: false,
	},
} as const

export const DEFAULT_MODEL_NAME: AgentModelName = 'claude-sonnet-4-5'

/**
 * Check if a string is a valid AgentModelName.
 */
export function isValidModelName(value: string | undefined): value is AgentModelName {
	return !!value && value in AGENT_MODEL_DEFINITIONS
}

/**
 * Get the full information about a model from its name.
 * @param modelName - The name of the model.
 * @returns The full definition of the model.
 */
export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}

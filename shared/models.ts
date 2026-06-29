export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'openai' | 'anthropic' | 'google' | 'local' | 'bedrock'

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

	// Amazon Bedrock models. Same Claude models Claude Code runs, reached over the
	// Bedrock runtime. Auth is either a bearer token (AWS_BEARER_TOKEN_BEDROCK) or
	// SigV4 from temporary SSO credentials; see AgentService. `id` is a region-scoped
	// inference profile id, which is why it differs from `name` (like the local
	// provider) and must bypass the AGENT_MODEL_DEFINITIONS id guard. Profile ids
	// are region-specific; these are the US (us-west-2) profiles, matching the
	// ClaudeBedrockAccess SSO role whose IAM policy only grants us-west-2 invoke.
	// Prefill is off: newer Claude models reject it, matching the Anthropic-provider
	// claude-sonnet-4-6 entry above.
	'bedrock-claude-sonnet-4-6': {
		name: 'bedrock-claude-sonnet-4-6',
		id: 'us.anthropic.claude-sonnet-4-6',
		provider: 'bedrock',
		supportsPrefill: false,
	},

	'bedrock-claude-opus-4-8': {
		name: 'bedrock-claude-opus-4-8',
		id: 'us.anthropic.claude-opus-4-8',
		provider: 'bedrock',
		supportsPrefill: false,
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

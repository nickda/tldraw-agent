import { ModelMessage, streamText } from 'ai'
import { AgentModelDefinition } from '../../shared/models'
import { buildResponseSchema } from '../../shared/schema/buildResponseSchema'
import type { ModePart } from '../../shared/schema/PromptPartDefinitions'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { buildMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'

// The provider-options shape `streamText()` accepts. Derived from the SDK so it
// stays in sync without importing the transitive `@ai-sdk/provider-utils` type.
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>

/**
 * An OpenAI-style `response_format` that constrains generation to the action
 * schema. koboldcpp converts this JSON schema to a grammar server-side, so a
 * small local model can only emit conforming action JSON. Only built for the
 * local path; cloud providers steer JSON via the prompt + prefill instead.
 */
export interface ResponseFormat {
	type: 'json_schema'
	json_schema: {
		name: string
		schema: object
	}
}

/**
 * The request configuration that `streamText()` consumes, decided purely from a
 * prompt and a model definition. Extracting this keeps the provider-routing
 * logic testable without calling a real model.
 */
export interface StreamConfig {
	messages: ModelMessage[]
	providerOptions: ProviderOptions
	/**
	 * Whether the response start (`{"actions": [{"_type":`) is forced via an
	 * assistant prefill message and must be prepended to the parse buffer.
	 */
	canForceResponseStart: boolean
	/**
	 * Schema-constrained output format. Set only for the local provider, where
	 * koboldcpp enforces it as a grammar. Undefined for cloud providers.
	 */
	responseFormat?: ResponseFormat
}

/**
 * Build the messages, provider options, and prefill decision for a stream
 * request. Pure function: no SDK calls. Provider routing is keyed on the model
 * definition's `provider`, never the SDK provider string.
 */
export function buildStreamConfig(
	prompt: AgentPrompt,
	modelDefinition: AgentModelDefinition
): StreamConfig {
	const provider = modelDefinition.provider
	const systemPrompt = buildSystemPrompt(prompt)

	const messages: ModelMessage[] = []

	// Add system prompt with Anthropic caching if applicable.
	// Anthropic requires explicit cache breakpoints. We set one at the end of the
	// system prompt to cache all system content (which generally changes together).
	if (provider === 'anthropic') {
		messages.push({
			role: 'system',
			content: systemPrompt,
			providerOptions: {
				anthropic: { cacheControl: { type: 'ephemeral' } },
			},
		})
	} else if (provider === 'bedrock') {
		// Bedrock expresses the same cache breakpoint as a `cachePoint` under the
		// `bedrock` provider key rather than Anthropic's `cacheControl`.
		messages.push({
			role: 'system',
			content: systemPrompt,
			providerOptions: {
				bedrock: { cachePoint: { type: 'default' } },
			},
		})
	} else {
		messages.push({
			role: 'system',
			content: systemPrompt,
		})
	}

	// Add prompt messages
	messages.push(...buildMessages(prompt))

	// Add the assistant message to indicate the start of the actions.
	// Some models (e.g. claude-sonnet-4-6+) do not support assistant message prefill.
	if (modelDefinition.supportsPrefill !== false) {
		messages.push({
			role: 'assistant',
			content: '{"actions": [{"_type":',
		})
	}

	// Configure thinking budgets based on model. We let models think using the
	// think action, so we keep this as low as possible to minimize time to first token.
	// Gemini: 256 for thinking models, 0 otherwise.
	const geminiThinkingBudget = modelDefinition.thinking ? 256 : 0

	// OpenAI: 'none' for OpenAI models, 'minimal' otherwise. Only OpenAI models
	// consume providerOptions.openai, so the 'minimal' branch is inert for the
	// other cloud providers; it preserves the pre-refactor request shape.
	const openaiReasoningEffort = provider === 'openai' ? 'none' : 'minimal'

	// The local path goes through the OpenAI SDK but hits koboldcpp, which does not
	// understand OpenAI-specific options (reasoningEffort) or the cloud thinking
	// configs. Send an empty options object for it.
	const providerOptions: ProviderOptions =
		provider === 'local'
			? {}
			: {
					anthropic: {
						thinking: { type: 'disabled' },
					},
					google: {
						thinkingConfig: { thinkingBudget: geminiThinkingBudget },
					},
					openai: {
						reasoningEffort: openaiReasoningEffort,
					},
				}

	const canForceResponseStart =
		(provider === 'anthropic' || provider === 'google') &&
		modelDefinition.supportsPrefill !== false

	// For the local path, constrain output to the action schema. koboldcpp turns
	// this into a grammar, which is what makes a small model emit valid action
	// JSON instead of free text. The schema matches the one embedded in the
	// system prompt (same actionTypes / modeType).
	let responseFormat: ResponseFormat | undefined
	if (provider === 'local') {
		const modePart = prompt.mode as ModePart | undefined
		if (modePart) {
			responseFormat = {
				type: 'json_schema',
				json_schema: {
					name: 'agent_actions',
					schema: buildResponseSchema(modePart.actionTypes, modePart.modeType),
				},
			}
		}
	}

	return { messages, providerOptions, canForceResponseStart, responseFormat }
}

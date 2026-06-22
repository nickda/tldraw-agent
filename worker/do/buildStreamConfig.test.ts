import { describe, expect, test } from 'bun:test'
import { AgentModelDefinition, getAgentModelDefinition } from '../../shared/models'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { buildStreamConfig } from './buildStreamConfig'

// Minimal prompt with just a mode part. buildSystemPrompt only requires the mode
// part; buildMessages produces no user messages from it, which is fine here: the
// assertions target system message options, the prefill message, and the
// force-response-start decision, none of which depend on user content.
const prompt = {
	mode: {
		type: 'mode',
		modeType: 'working',
		partTypes: [],
		actionTypes: ['create'],
	},
} as unknown as AgentPrompt

describe('buildStreamConfig', () => {
	test('cloud anthropic model keeps cache control, prefill, and force-response-start', () => {
		const def = getAgentModelDefinition('claude-sonnet-4-5')
		const { messages, providerOptions, canForceResponseStart } = buildStreamConfig(prompt, def)

		const systemMessage = messages[0]
		expect(systemMessage.role).toBe('system')
		expect(systemMessage.providerOptions).toEqual({
			anthropic: { cacheControl: { type: 'ephemeral' } },
		})

		const prefill = messages[messages.length - 1]
		expect(prefill).toEqual({ role: 'assistant', content: '{"actions": [{"_type":' })

		expect(canForceResponseStart).toBe(true)
		expect(providerOptions.openai).toEqual({ reasoningEffort: 'minimal' })
	})

	test('anthropic model without prefill support drops the prefill message and force-response-start', () => {
		const def = getAgentModelDefinition('claude-sonnet-4-6')
		const { messages, canForceResponseStart } = buildStreamConfig(prompt, def)

		const last = messages[messages.length - 1]
		expect(last.role).not.toBe('assistant')
		expect(canForceResponseStart).toBe(false)
	})

	test('google model gets force-response-start but no anthropic cache control', () => {
		const def = getAgentModelDefinition('gemini-3-flash-preview')
		const { messages, canForceResponseStart } = buildStreamConfig(prompt, def)

		expect(messages[0].providerOptions).toBeUndefined()
		expect(canForceResponseStart).toBe(true)
	})

	test('google thinking model sets a 256 token thinking budget', () => {
		const def = getAgentModelDefinition('gemini-3-pro-preview')
		const { providerOptions } = buildStreamConfig(prompt, def)

		expect(providerOptions.google).toEqual({ thinkingConfig: { thinkingBudget: 256 } })
	})

	test('local model strips openai/thinking options, drops prefill, no force-response-start', () => {
		const def = getAgentModelDefinition('local')
		const { messages, providerOptions, canForceResponseStart } = buildStreamConfig(prompt, def)

		// koboldcpp does not understand OpenAI-specific or cloud thinking options.
		expect(providerOptions).toEqual({})

		// No anthropic cache control on the system message.
		expect(messages[0].providerOptions).toBeUndefined()

		// supportsPrefill: false -> no assistant prefill message.
		expect(messages[messages.length - 1].role).not.toBe('assistant')

		expect(canForceResponseStart).toBe(false)
	})

	test('openai model uses reasoningEffort none and no force-response-start', () => {
		const def = getAgentModelDefinition('gpt-5.2-2025-12-11')
		const { messages, providerOptions, canForceResponseStart } = buildStreamConfig(prompt, def)

		expect(messages[0].providerOptions).toBeUndefined()
		expect(providerOptions.openai).toEqual({ reasoningEffort: 'none' })
		// openai supports prefill (not opted out), so the prefill message is present...
		expect(messages[messages.length - 1]).toEqual({
			role: 'assistant',
			content: '{"actions": [{"_type":',
		})
		// ...but force-response-start is only for anthropic / google.
		expect(canForceResponseStart).toBe(false)
	})
})

describe('getAgentModelDefinition registry guard', () => {
	test('returns the expected provider and prefill fields for a cloud model', () => {
		const def: AgentModelDefinition = getAgentModelDefinition('claude-sonnet-4-6')
		expect(def.provider).toBe('anthropic')
		expect(def.supportsPrefill).toBe(false)
	})

	test('a model without an explicit supportsPrefill defaults to undefined (prefill on)', () => {
		const def = getAgentModelDefinition('claude-sonnet-4-5')
		expect(def.provider).toBe('anthropic')
		expect(def.supportsPrefill).toBeUndefined()
	})

	test('the local model is registered with provider local and prefill off', () => {
		const def = getAgentModelDefinition('local')
		expect(def.provider).toBe('local')
		expect(def.supportsPrefill).toBe(false)
	})
})

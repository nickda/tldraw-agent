import { describe, expect, test } from 'bun:test'
import { resolveBackendModel, resolveBedrockModel } from './resolveBackendModel'

describe('resolveBedrockModel', () => {
	test('falls back to the default when no override is given', () => {
		expect(resolveBedrockModel(undefined)).toBe('bedrock-claude-sonnet-4-6')
	})

	test('falls back to the default when the override names an unknown model', () => {
		expect(resolveBedrockModel('not-a-real-model')).toBe('bedrock-claude-sonnet-4-6')
	})

	test('falls back to the default when the override names a non-bedrock model', () => {
		expect(resolveBedrockModel('claude-sonnet-4-5')).toBe('bedrock-claude-sonnet-4-6')
	})

	test('uses the override when it names a valid bedrock model', () => {
		expect(resolveBedrockModel('bedrock-claude-opus-4-8')).toBe('bedrock-claude-opus-4-8')
	})
})

describe('resolveBackendModel', () => {
	test('bedrock backend always resolves to the pinned bedrock model, regardless of request', () => {
		expect(resolveBackendModel('bedrock', 'bedrock-claude-opus-4-8', 'claude-sonnet-4-5')).toBe(
			'bedrock-claude-opus-4-8'
		)
		expect(resolveBackendModel('bedrock', 'bedrock-claude-opus-4-8', undefined)).toBe(
			'bedrock-claude-opus-4-8'
		)
	})

	test('local backend forces a non-bedrock request to local', () => {
		expect(resolveBackendModel('local', 'bedrock-claude-sonnet-4-6', 'claude-sonnet-4-5')).toBe('local')
	})

	test('local backend forces a request with no model name to local', () => {
		expect(resolveBackendModel('local', 'bedrock-claude-sonnet-4-6', undefined)).toBe('local')
	})

	test('local backend forces an unrecognized model name to local', () => {
		expect(resolveBackendModel('local', 'bedrock-claude-sonnet-4-6', 'not-a-real-model')).toBe('local')
	})

	test('local backend passes an explicit bedrock request through unchanged', () => {
		expect(resolveBackendModel('local', 'bedrock-claude-sonnet-4-6', 'bedrock-claude-opus-4-8')).toBe(
			'bedrock-claude-opus-4-8'
		)
	})
})

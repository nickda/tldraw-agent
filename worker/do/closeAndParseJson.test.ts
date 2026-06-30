import { describe, expect, test } from 'bun:test'
import { closeAndParseJson } from './closeAndParseJson'

describe('closeAndParseJson', () => {
	test('parses complete JSON', () => {
		const result = closeAndParseJson('{"actions": [{"_type": "create"}]}')
		expect(result).toEqual({ actions: [{ _type: 'create' }] })
	})

	test('closes incomplete JSON (missing brackets)', () => {
		const result = closeAndParseJson('{"actions": [{"_type": "create"')
		expect(result).toEqual({ actions: [{ _type: 'create' }] })
	})

	test('returns null for empty string', () => {
		expect(closeAndParseJson('')).toBeNull()
	})

	test('returns null for string with no JSON start', () => {
		expect(closeAndParseJson('thinking about what to do...')).toBeNull()
	})

	test('strips non-JSON preamble before first brace', () => {
		const withPreamble = "I'll create a plan for this.\n\n{\"actions\": [{\"_type\": \"writePlan\"}]}"
		const result = closeAndParseJson(withPreamble)
		expect(result).toEqual({ actions: [{ _type: 'writePlan' }] })
	})

	test('strips markdown code fence preamble', () => {
		const withFence = "```json\n{\"actions\": [{\"_type\": \"create\"}]}"
		const result = closeAndParseJson(withFence)
		expect(result).toEqual({ actions: [{ _type: 'create' }] })
	})

	test('handles preamble with incomplete JSON', () => {
		const partial = "Here's the plan:\n{\"actions\": [{\"_type\": \"writePlan\", \"items\": [{\"text\": \"draw"
		const result = closeAndParseJson(partial)
		expect(result).toEqual({ actions: [{ _type: 'writePlan', items: [{ text: 'draw' }] }] })
	})

	test('handles braces inside quoted strings correctly', () => {
		const result = closeAndParseJson('{"text": "a { curly } thing"}')
		expect(result).toEqual({ text: 'a { curly } thing' })
	})

	test('handles escaped quotes in strings', () => {
		const result = closeAndParseJson('{"text": "say \\"hello\\""}')
		expect(result).toEqual({ text: 'say "hello"' })
	})
})

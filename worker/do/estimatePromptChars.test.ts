import { describe, expect, test } from 'bun:test'
import { ModelMessage } from 'ai'
import { estimatePromptChars } from './estimatePromptChars'

describe('estimatePromptChars', () => {
	test('sums plain string content', () => {
		const messages: ModelMessage[] = [
			{ role: 'system', content: 'abcde' },
			{ role: 'user', content: 'abc' },
		]
		expect(estimatePromptChars(messages)).toBe(8)
	})

	test('sums text parts from array-shaped content', () => {
		const messages: ModelMessage[] = [
			{ role: 'system', content: 'abcde' },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'hello' },
					{ type: 'text', text: 'world' },
				],
			},
		]
		// 'abcde' (5) + 'hello' (5) + 'world' (5) = 15
		expect(estimatePromptChars(messages)).toBe(15)
	})

	test('ignores non-text parts within array-shaped content', () => {
		const messages: ModelMessage[] = [
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'hi' },
					{ type: 'image', image: 'data:image/png;base64,AAAA' },
				],
			},
		]
		expect(estimatePromptChars(messages)).toBe(2)
	})
})

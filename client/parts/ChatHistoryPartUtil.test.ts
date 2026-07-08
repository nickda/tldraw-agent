import { describe, expect, test } from 'bun:test'
import { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import { capChatHistory, MAX_CHAT_HISTORY_ITEMS } from './ChatHistoryPartUtil'

function continuationItem(n: number): ChatHistoryItem {
	return { type: 'continuation', data: [n] }
}

describe('capChatHistory', () => {
	test('returns the history unchanged when at or under the cap', () => {
		const history = Array.from({ length: MAX_CHAT_HISTORY_ITEMS }, (_, i) => continuationItem(i))
		expect(capChatHistory(history)).toEqual(history)
	})

	test('keeps only the most recent items when over the cap', () => {
		const history = Array.from({ length: MAX_CHAT_HISTORY_ITEMS + 5 }, (_, i) => continuationItem(i))
		const result = capChatHistory(history)
		expect(result).toHaveLength(MAX_CHAT_HISTORY_ITEMS)
		expect(result).toEqual(history.slice(5))
	})

	test('preserves order (oldest of the kept items first)', () => {
		const history = Array.from({ length: MAX_CHAT_HISTORY_ITEMS + 1 }, (_, i) => continuationItem(i))
		const result = capChatHistory(history)
		expect((result[0] as { data: number[] }).data[0]).toBe(1)
		expect((result[result.length - 1] as { data: number[] }).data[0]).toBe(
			MAX_CHAT_HISTORY_ITEMS
		)
	})

	test('handles an empty history', () => {
		expect(capChatHistory([])).toEqual([])
	})
})

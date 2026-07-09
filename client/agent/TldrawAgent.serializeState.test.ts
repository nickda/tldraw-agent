import { describe, expect, test } from 'bun:test'
import { MAX_CHAT_HISTORY_ITEMS } from '../utils/capChatHistory'
import { TldrawAgent } from './TldrawAgent'

/**
 * Issue #54: persisted chat history used to be saved verbatim and grow
 * unboundedly across a long session (each item can carry a full RecordsDiff),
 * risking the localStorage quota. serializeState() now caps it the same way
 * the model-facing chat history prompt part already does.
 */
describe('TldrawAgent.serializeState() caps persisted chat history', () => {
	test('a long synthetic session does not grow the persisted payload unboundedly', () => {
		const fullHistory = Array.from({ length: MAX_CHAT_HISTORY_ITEMS + 200 }, (_, i) => ({
			type: 'continuation' as const,
			data: [i],
		}))
		const fakeAgent = {
			chat: { getHistory: () => fullHistory },
			chatOrigin: { getOrigin: () => ({ x: 0, y: 0 }) },
			todos: { getTodos: () => [] },
			context: { getItems: () => [] },
			modelName: { getModelName: () => 'claude-sonnet-4-5' },
			debug: { getDebugFlags: () => ({}) },
			role: 'solo',
			beeName: 'Beeyonce',
			beeColor: 'yellow',
		}

		const state = TldrawAgent.prototype.serializeState.call(fakeAgent as any)

		expect(state.chatHistory).toHaveLength(MAX_CHAT_HISTORY_ITEMS)
		// Most recent items are kept, not the oldest.
		expect((state.chatHistory!.at(-1) as any).data[0]).toBe(MAX_CHAT_HISTORY_ITEMS + 199)
	})

	test('a short session under the cap is persisted unchanged', () => {
		const shortHistory = [{ type: 'continuation' as const, data: [1] }]
		const fakeAgent = {
			chat: { getHistory: () => shortHistory },
			chatOrigin: { getOrigin: () => ({ x: 0, y: 0 }) },
			todos: { getTodos: () => [] },
			context: { getItems: () => [] },
			modelName: { getModelName: () => 'claude-sonnet-4-5' },
			debug: { getDebugFlags: () => ({}) },
			role: 'solo',
			beeName: 'Beeyonce',
			beeColor: 'yellow',
		}

		const state = TldrawAgent.prototype.serializeState.call(fakeAgent as any)
		expect(state.chatHistory).toEqual(shortHistory)
	})
})

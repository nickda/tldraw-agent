import { describe, expect, mock, test, vi } from 'bun:test'
import { atom } from 'tldraw'
import { AgentAppPersistenceManager } from './AgentAppPersistenceManager'

/**
 * Tests for issue #54: auto-save used to fire a synchronous localStorage
 * write on every streamed action delta (chat history changes many times per
 * second while a prompt is generating, not just once per action), risking
 * hitting the storage quota on long sessions. Save is now debounced, the
 * persisted chat history is capped, and a failed save is surfaced via
 * `onError`, not just a console line.
 */

/** A fake localStorage that can be told to throw on write, to simulate quota exceeded. */
function makeFakeLocalStorage({ throwOnSet = false } = {}) {
	const store = new Map<string, string>()
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (throwOnSet) throw new DOMException('QuotaExceededError')
			store.set(key, value)
		},
		removeItem: (key: string) => store.delete(key),
		get size() {
			return store.size
		},
		raw: store,
	}
}

/** A fake agent exposing just the reactive atoms AgentAppPersistenceManager watches. */
function makeFakeAgent(id: string, historyLength = 0) {
	const $chatHistory = atom('chatHistory', Array.from({ length: historyLength }, (_, i) => i))
	const $origin = atom('origin', { x: 0, y: 0 })
	const $todos = atom('todos', [] as unknown[])
	const $context = atom('context', [] as unknown[])
	const $modelName = atom('modelName', 'claude-sonnet-4-5')
	const $debug = atom('debug', {} as unknown)

	return {
		id,
		chat: { getHistory: () => $chatHistory.get(), push: (n: number) => $chatHistory.update((h) => [...h, n]) },
		chatOrigin: { getOrigin: () => $origin.get() },
		todos: { getTodos: () => $todos.get() },
		context: { getItems: () => $context.get() },
		modelName: { getModelName: () => $modelName.get() },
		debug: { getDebugFlags: () => $debug.get() },
		serializeState: () => ({ chatHistory: $chatHistory.get() }),
		loadState: mock(() => {}),
	} as any
}

function makeApp(agents: ReturnType<typeof makeFakeAgent>[], options: { onError?: (e: any) => void } = {}) {
	return {
		agents: {
			getAgents: () => agents,
			createAgent: mock(() => agents[0]),
		},
		options: {
			onError: options.onError ?? mock(() => {}),
		},
	} as any
}

describe('AgentAppPersistenceManager: debounced auto-save', () => {
	test('ten streamed deltas arriving within the debounce window result in a single save, not ten', () => {
		vi.useFakeTimers()
		try {
			const fakeStorage = makeFakeLocalStorage()
			const originalLocalStorage = globalThis.localStorage
			;(globalThis as any).localStorage = fakeStorage

			const agent = makeFakeAgent('agent-1')
			const app = makeApp([agent])
			const manager = new AgentAppPersistenceManager(app)
			const setItemSpy = vi.spyOn(fakeStorage, 'setItem')

			manager.startAutoSave()

			for (let i = 0; i < 10; i++) {
				agent.chat.push(i)
			}

			// Nothing written yet: still inside the debounce window.
			expect(setItemSpy).not.toHaveBeenCalled()

			vi.advanceTimersByTime(500)

			expect(setItemSpy).toHaveBeenCalledTimes(1)

			manager.dispose()
			;(globalThis as any).localStorage = originalLocalStorage
		} finally {
			vi.useRealTimers()
		}
	})

	test('a save that is still pending when the app disposes is flushed, not dropped', () => {
		vi.useFakeTimers()
		try {
			const fakeStorage = makeFakeLocalStorage()
			const originalLocalStorage = globalThis.localStorage
			;(globalThis as any).localStorage = fakeStorage

			const agent = makeFakeAgent('agent-1')
			const app = makeApp([agent])
			const manager = new AgentAppPersistenceManager(app)
			manager.startAutoSave()

			agent.chat.push(1)
			// Dispose immediately, well before the debounce window elapses.
			manager.dispose()

			const saved = JSON.parse(fakeStorage.getItem('tldraw-agent-app:state')!)
			expect(saved.agents['agent-1'].chatHistory).toContain(1)

			;(globalThis as any).localStorage = originalLocalStorage
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('AgentAppPersistenceManager: failed save is not a silent no-op', () => {
	test('a save that throws (e.g. quota exceeded) is routed to onError, not just console.warn', () => {
		const fakeStorage = makeFakeLocalStorage({ throwOnSet: true })
		const originalLocalStorage = globalThis.localStorage
		;(globalThis as any).localStorage = fakeStorage

		const onError = mock(() => {})
		const agent = makeFakeAgent('agent-1')
		const app = makeApp([agent], { onError })
		const manager = new AgentAppPersistenceManager(app)

		// dispose() flushes a save synchronously, so it's the failure path exercised here.
		manager.startAutoSave()
		manager.dispose()

		expect(onError).toHaveBeenCalledTimes(1)

		;(globalThis as any).localStorage = originalLocalStorage
	})
})

import { describe, expect, test } from 'bun:test'
import { aggregateBeeDialogue, type AgentSnapshot } from './useBeeDialogue'

function snapshot(
	agentId: string,
	beeName: string,
	beeColor: string,
	messages: Array<{ text: string; complete: boolean } | null>
): AgentSnapshot {
	return {
		agentId,
		beeName,
		beeColor,
		history: messages.map((m) =>
			m === null
				? { type: 'prompt', promptSource: 'user', agentFacingMessage: '', userFacingMessage: null, contextItems: [], selectedShapes: [] }
				: {
						type: 'action',
						action: { _type: 'message', text: m.text, complete: m.complete, time: 0 },
						diff: { added: {}, updated: {}, removed: {} },
						acceptance: 'accepted',
					}
		),
	}
}

describe('aggregateBeeDialogue', () => {
	test('extracts only complete message actions', () => {
		const snapshots = [
			snapshot('a1', 'Beeyonce', '#6366f1', [
				{ text: 'Drawing a house.', complete: true },
				{ text: 'still typing', complete: false },
				null,
			]),
		]
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		const clock = { now: 1000 }
		const lines = aggregateBeeDialogue(snapshots, cache, lastLengths, () => clock.now)

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			key: 'a1:0',
			agentId: 'a1',
			beeName: 'Beeyonce',
			beeColor: '#6366f1',
			text: 'Drawing a house.',
			timestamp: 1000,
		})
	})

	test('stamps each message once, reusing the cached timestamp on later calls', () => {
		const snapshots = [snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'hello', complete: true }])]
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const first = aggregateBeeDialogue(snapshots, cache, lastLengths, () => now)
		now = 5000
		const second = aggregateBeeDialogue(snapshots, cache, lastLengths, () => now)

		expect(first[0].timestamp).toBe(1000)
		expect(second[0].timestamp).toBe(1000)
	})

	test('merges and sorts messages from multiple agents by timestamp', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		// Beeyonce speaks first.
		let lines = aggregateBeeDialogue(
			[snapshot('planner', 'Beeyonce', '#6366f1', [{ text: 'first', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)
		expect(lines.map((l) => l.text)).toEqual(['first'])

		// Now MacBee speaks later, and both snapshots are present.
		now = 2000
		lines = aggregateBeeDialogue(
			[
				snapshot('planner', 'Beeyonce', '#6366f1', [{ text: 'first', complete: true }]),
				snapshot('exec0', 'MacBee', '#f59e0b', [{ text: 'second', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(lines.map((l) => l.text)).toEqual(['first', 'second'])
		expect(lines.map((l) => l.timestamp)).toEqual([1000, 2000])
	})

	test('invalidates a single agent cache when its history shrinks (reset)', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		aggregateBeeDialogue(
			[snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'old message', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.has('a1:0')).toBe(true)

		// Agent a1 is reset: history is now empty, then a new message lands at index 0.
		now = 9000
		aggregateBeeDialogue([snapshot('a1', 'Beeyonce', '#6366f1', [])], cache, lastLengths, clockFn)
		const lines = aggregateBeeDialogue(
			[snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'new message', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ text: 'new message', timestamp: 9000 })
	})

	test('does not cross-contaminate cache invalidation between agents', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		aggregateBeeDialogue(
			[
				snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'a1 msg', complete: true }]),
				snapshot('a2', 'MacBee', '#f59e0b', [{ text: 'a2 msg', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.get('a1:0')).toBe(1000)
		expect(cache.get('a2:0')).toBe(1000)

		// Only a1 resets. a2's cached stamp must survive untouched.
		now = 5000
		aggregateBeeDialogue(
			[
				snapshot('a1', 'Beeyonce', '#6366f1', []),
				snapshot('a2', 'MacBee', '#f59e0b', [{ text: 'a2 msg', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.get('a2:0')).toBe(1000)
	})

	test('empty agent list produces an empty result', () => {
		expect(aggregateBeeDialogue([], new Map(), new Map(), () => 1)).toEqual([])
	})
})

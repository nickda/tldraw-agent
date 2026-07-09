import { describe, expect, test } from 'bun:test'
import { parseActionStream } from './parseActionStream'

async function* toStream(chunks: string[]) {
	for (const chunk of chunks) yield chunk
}

async function collect(
	textStream: AsyncIterable<string>,
	initialBuffer = '',
	hasError: () => boolean = () => false
) {
	const events: any[] = []
	const generator = parseActionStream(textStream, initialBuffer, hasError)
	while (true) {
		const { value, done } = await generator.next()
		if (done) return { events, finalState: value }
		events.push(value)
	}
}

describe('parseActionStream', () => {
	test('yields every action that completes within a single chunk, in order', async () => {
		// The whole two-action payload arrives in one chunk, so the parsed action
		// count jumps straight from 0 to 2. Both must be yielded as complete.
		const { events } = await collect(
			toStream(['{"actions": [{"_type": "message", "text": "a"}, {"_type": "message", "text": "b"}]}'])
		)

		const completeEvents = events.filter((e) => e.complete)
		expect(completeEvents.map((e) => e.text)).toEqual(['a', 'b'])
	})

	test('yields three actions that all complete in a single chunk', async () => {
		const { events } = await collect(
			toStream([
				'{"actions": [{"_type": "message", "text": "a"}, {"_type": "message", "text": "b"}, {"_type": "message", "text": "c"}]}',
			])
		)

		const completeEvents = events.filter((e) => e.complete)
		expect(completeEvents.map((e) => e.text)).toEqual(['a', 'b', 'c'])
	})

	test('still handles one action completing per chunk', async () => {
		const { events } = await collect(
			toStream([
				'{"actions": [{"_type": "message", "text": "a"}',
				', {"_type": "message", "text": "b"}]}',
			])
		)

		const completeEvents = events.filter((e) => e.complete)
		expect(completeEvents.map((e) => e.text)).toEqual(['a', 'b'])
	})

	test('flushes a final incomplete action as complete once the stream ends', async () => {
		const { events } = await collect(toStream(['{"actions": [{"_type": "message", "text": "a"}]}']))

		const completeEvents = events.filter((e) => e.complete)
		expect(completeEvents).toHaveLength(1)
		expect(completeEvents[0].text).toBe('a')
	})

	test('does not flush the trailing incomplete action as complete when the stream errored', async () => {
		// The stream ends with a partial action still pending (no closing "]}"),
		// simulating a provider error reported via onError after textStream stops
		// yielding chunks. hasError() returning true must suppress the final flush
		// entirely: a truncated response from a failed call is never complete.
		const { events } = await collect(
			toStream(['{"actions": [{"_type": "message", "text": "a"}']),
			'',
			() => true
		)

		const completeEvents = events.filter((e) => e.complete)
		expect(completeEvents).toHaveLength(0)
	})
})

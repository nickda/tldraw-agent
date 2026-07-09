import { describe, expect, test } from 'bun:test'
import { createSSEStreamResponse } from './createSSEStreamResponse'

/**
 * Issue #55, bug 1: the Cloudflare Durable Object streamed the model call
 * fire-and-forget with no link to client disconnect, so a dropped connection
 * didn't stop token consumption. The local Node server already stopped via a
 * `ReadableStream.cancel()`-driven flag. createSSEStreamResponse now backs
 * both backends with one implementation: `cancel()` aborts a shared
 * AbortSignal, which the generator is expected to observe.
 */

async function readAllChunks(response: Response): Promise<string> {
	const reader = response.body!.getReader()
	const decoder = new TextDecoder()
	let out = ''
	while (true) {
		const { value, done } = await reader.read()
		if (done) break
		out += decoder.decode(value)
	}
	return out
}

describe('createSSEStreamResponse', () => {
	test('streams each yielded change as an SSE data line', async () => {
		async function* makeStream() {
			yield { _type: 'create' } as any
			yield { _type: 'update' } as any
		}

		const response = createSSEStreamResponse(makeStream)
		const text = await readAllChunks(response)

		expect(text).toContain('data: {"_type":"create"}')
		expect(text).toContain('data: {"_type":"update"}')
	})

	test('a thrown error from the generator is sent as an SSE error payload, and the stream still closes', async () => {
		async function* makeStream(): AsyncGenerator<any> {
			yield { _type: 'create' } as any
			throw new Error('model call failed')
		}

		const response = createSSEStreamResponse(makeStream)
		const text = await readAllChunks(response)

		expect(text).toContain('data: {"error":"model call failed"}')
	})

	test('response headers mark the stream as SSE with no caching/buffering', () => {
		async function* makeStream() {}
		const response = createSSEStreamResponse(makeStream)

		expect(response.headers.get('Content-Type')).toBe('text/event-stream')
		expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
	})

	test('cancelling the response body stream aborts the signal passed to the generator', async () => {
		let observedAborted = false
		let releaseGenerator: (() => void) | null = null
		const blocked = new Promise<void>((resolve) => {
			releaseGenerator = resolve
		})

		async function* makeStream(signal: AbortSignal) {
			yield { _type: 'create' } as any
			// Simulate an in-flight model call: block until the test cancels the
			// reader, then observe whether the signal was aborted.
			await blocked
			observedAborted = signal.aborted
			yield { _type: 'update' } as any
		}

		const response = createSSEStreamResponse(makeStream)
		const reader = response.body!.getReader()

		// Read the first chunk so the generator is definitely running and past its
		// first yield, then cancel — mirroring a client disconnecting mid-stream.
		await reader.read()
		await reader.cancel()
		releaseGenerator!()

		// Give the generator's microtask a tick to observe the abort.
		await new Promise((r) => setTimeout(r, 0))

		expect(observedAborted).toBe(true)
	})
})

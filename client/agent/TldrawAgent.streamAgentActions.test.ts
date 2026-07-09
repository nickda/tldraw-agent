import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { TldrawAgent } from './TldrawAgent'

/**
 * Issue #55, bug 3: a single malformed JSON line in the SSE response used to
 * throw and abort the entire stream, and a genuine server-reported error
 * event was handled identically to "we failed to parse a chunk" — both threw
 * a generic re-wrapped Error, losing the distinction and the original stack.
 *
 * streamAgentActions() now skips an unparseable chunk and keeps consuming
 * the stream, while a server `{"error": ...}` payload still throws (fatal),
 * since that's the server telling us the request genuinely failed.
 */

function sseResponse(lines: string[]): Response {
	const encoder = new TextEncoder()
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line))
			}
			controller.close()
		},
	})
	return new Response(body)
}

async function collect(agent: any, prompt: any, signal: AbortSignal) {
	const results: any[] = []
	for await (const action of TldrawAgent.prototype['streamAgentActions'].call(agent, {
		prompt,
		signal,
	})) {
		results.push(action)
	}
	return results
}

describe('streamAgentActions', () => {
	let originalFetch: typeof fetch

	beforeEach(() => {
		originalFetch = globalThis.fetch
	})
	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	test('yields each well-formed action', async () => {
		globalThis.fetch = (async () =>
			sseResponse([`data: {"_type":"create","complete":true}\n\n`])) as any

		const results = await collect({}, {}, new AbortController().signal)
		expect(results).toEqual([{ _type: 'create', complete: true }])
	})

	test('a malformed chunk is skipped, not fatal — subsequent well-formed actions still come through', async () => {
		globalThis.fetch = (async () =>
			sseResponse([
				`data: {not valid json\n\n`,
				`data: {"_type":"create","complete":true}\n\n`,
			])) as any

		const results = await collect({}, {}, new AbortController().signal)
		expect(results).toEqual([{ _type: 'create', complete: true }])
	})

	test('a server-reported error event still throws, distinguishing it from a parse failure', async () => {
		globalThis.fetch = (async () =>
			sseResponse([`data: {"error":"model call failed"}\n\n`])) as any

		await expect(collect({}, {}, new AbortController().signal)).rejects.toThrow(
			'model call failed'
		)
	})

	test('an error event arriving after good actions still surfaces the already-yielded actions before throwing', async () => {
		globalThis.fetch = (async () =>
			sseResponse([
				`data: {"_type":"create","complete":true}\n\n`,
				`data: {"error":"model call failed"}\n\n`,
			])) as any

		const results: any[] = []
		let thrown: any
		try {
			for await (const action of TldrawAgent.prototype['streamAgentActions'].call(
				{},
				{ prompt: {}, signal: new AbortController().signal }
			)) {
				results.push(action)
			}
		} catch (e) {
			thrown = e
		}

		expect(results).toEqual([{ _type: 'create', complete: true }])
		expect(thrown).toBeInstanceOf(Error)
		expect((thrown as Error).message).toBe('model call failed')
	})
})

import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'

/**
 * Build an SSE `Response` from an async generator of streamed actions.
 *
 * Shared by the Cloudflare Durable Object and the local Node server so a
 * client disconnect is handled identically on both backends: `ReadableStream`
 * calls `cancel()` when the consumer goes away. That aborts the signal passed
 * into `makeStream`, so the model call stops (and, on a cloud provider, stops
 * billing) instead of continuing until a write to the dead connection fails.
 */
export function createSSEStreamResponse(
	makeStream: (signal: AbortSignal) => AsyncGenerator<Streaming<AgentAction>>
): Response {
	const encoder = new TextEncoder()
	const abortController = new AbortController()

	const readable = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (payload: unknown) => {
				if (abortController.signal.aborted) return
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
			}
			try {
				for await (const change of makeStream(abortController.signal)) {
					if (abortController.signal.aborted) break
					send(change)
				}
			} catch (error: any) {
				const msg = error?.message || error?.toString?.() || 'Unknown stream error'
				console.error('Stream error:', msg, error)
				send({ error: msg })
			} finally {
				if (!abortController.signal.aborted) controller.close()
			}
		},
		cancel() {
			// Client disconnected (e.g. user fired a new prompt). Stop pulling
			// further tokens from the model.
			abortController.abort()
		},
	})

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	})
}

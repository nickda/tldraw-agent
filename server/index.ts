import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { AgentAction } from '../shared/types/AgentAction'
import { AgentPrompt } from '../shared/types/AgentPrompt'
import { Streaming } from '../shared/types/Streaming'
import { AgentService } from '../worker/do/AgentService'
import { ModelEnvironment } from '../worker/environment'

// Node backend for the local-model path. Reuses AgentService unchanged; it is
// the same core the Cloudflare Durable Object runs, so geometry-class fixes land
// in both backends. This entry point only handles SSE plumbing + static serving.
//
// The Durable Object holds no state (single 'anonymous' instance), so this port
// carries none either: one shared AgentService for the process.

const env: ModelEnvironment = {
	// Cloud keys are unused on the local path but kept so the constructor's other
	// providers initialise without throwing.
	OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
	LOCAL_MODEL_URL: process.env.LOCAL_MODEL_URL ?? 'http://localhost:5001/v1',
}

const service = new AgentService(env)

const app = new Hono()

app.post('/stream', async (c) => {
	const prompt = (await c.req.json()) as AgentPrompt

	// Force the local model regardless of what the client selected. The client UI
	// has no local option and always sends a cloud model name.
	if (prompt.modelName) {
		prompt.modelName.modelName = 'local'
	}

	const encoder = new TextEncoder()

	const readable = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const change of service.stream(prompt) as AsyncGenerator<
					Streaming<AgentAction>
				>) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(change)}\n\n`))
				}
			} catch (error: any) {
				console.error('Stream error:', error)
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
				)
			} finally {
				controller.close()
			}
		},
	})

	// Same headers the Durable Object set, so SSE / buffering behaviour matches.
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
})

// In production the Pi runs `node server` serving the built client. In Mac dev,
// vite serves the client and proxies /stream here, so static serving is a noop.
const serveAssets = process.env.AGENT_SERVE_DIST !== 'false'
if (serveAssets) {
	// `vite build` emits the client to dist/client (see the Cloudflare assets dir).
	app.use('/*', serveStatic({ root: './dist/client' }))
	// SPA fallback: any unmatched route returns index.html.
	app.get('*', serveStatic({ path: './dist/client/index.html' }))
}

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => {
	console.log(`tldraw-agent local backend listening on http://localhost:${info.port}`)
	console.log(`LOCAL_MODEL_URL=${env.LOCAL_MODEL_URL}`)
})

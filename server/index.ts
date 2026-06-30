import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { AgentAction } from '../shared/types/AgentAction'
import { AgentPrompt } from '../shared/types/AgentPrompt'
import { Streaming } from '../shared/types/Streaming'
import { AgentModelName, isValidModelName, getAgentModelDefinition } from '../shared/models'
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
	// Bedrock auth, only consumed when a `bedrock-*` model runs. Bearer token
	// (Claude Code's AWS_BEARER_TOKEN_BEDROCK) takes precedence; otherwise the
	// SigV4 triple from `aws configure export-credentials` (temporary SSO creds).
	AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK ?? '',
	AWS_REGION: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? '',
	AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
	AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN ?? '',
	LOCAL_MODEL_URL: process.env.LOCAL_MODEL_URL ?? 'http://localhost:5001/v1',
}

// Backend mode, set by AGENT_BACKEND. Two values:
//   'local'   (default) koboldcpp path. Every prompt is forced to the `local`
//             model except an explicit `bedrock-*` selection, which passes
//             through so local vs Bedrock can be compared in one UI.
//   'bedrock' fully Bedrock. Every prompt is forced to AGENT_BEDROCK_MODEL (or
//             the default below). koboldcpp is never contacted; no local model
//             server need run.
const AGENT_BACKEND = process.env.AGENT_BACKEND === 'bedrock' ? 'bedrock' : 'local'

// Which Bedrock model the 'bedrock' backend pins every prompt to. Override with
// AGENT_BEDROCK_MODEL (must be a defined `bedrock-*` model name).
const BEDROCK_MODEL: AgentModelName = (() => {
	const requested = process.env.AGENT_BEDROCK_MODEL
	if (isValidModelName(requested) && getAgentModelDefinition(requested).provider === 'bedrock') {
		return requested
	}
	return 'bedrock-claude-sonnet-4-6'
})()

// Whether the client's selected model is allowed through unchanged in 'local'
// mode. Bedrock selections run as-is; everything else collapses to `local`.
function isPassthroughModel(modelName: string | undefined): boolean {
	if (!isValidModelName(modelName)) return false
	return getAgentModelDefinition(modelName).provider === 'bedrock'
}

const service = new AgentService(env)

const app = new Hono()

app.post('/stream', async (c) => {
	const prompt = (await c.req.json()) as AgentPrompt
	console.log('[STREAM] mode:', prompt.mode?.modeType, 'actions:', prompt.mode?.actionTypes?.length)

	// Pin the model per backend mode. In 'bedrock' mode every prompt runs on the
	// chosen Bedrock model. In 'local' mode force `local` unless the client picked
	// a passthrough (bedrock) model.
	if (prompt.modelName) {
		if (AGENT_BACKEND === 'bedrock') {
			prompt.modelName.modelName = BEDROCK_MODEL
		} else if (!isPassthroughModel(prompt.modelName.modelName)) {
			prompt.modelName.modelName = 'local'
		}
	}

	const encoder = new TextEncoder()

	// Track whether the client has gone away. Firing a new prompt cancels the
	// previous fetch, which closes the controller; enqueuing after that throws
	// ERR_INVALID_STATE. The flag lets us stop pulling from the model and skip
	// any further enqueue/close on a dead stream.
	let cancelled = false

	const readable = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (payload: unknown) => {
				if (cancelled) return
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
			}
			try {
				for await (const change of service.stream(prompt) as AsyncGenerator<
					Streaming<AgentAction>
				>) {
					if (cancelled) break
					send(change)
				}
			} catch (error: any) {
				const msg = error?.message || error?.toString?.() || 'Unknown stream error'
				console.error('Stream error:', msg, error)
				send({ error: msg })
			} finally {
				if (!cancelled) controller.close()
			}
		},
		cancel() {
			// Client disconnected (e.g. user fired a new prompt). Stop streaming.
			cancelled = true
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
	console.log(`tldraw-agent ${AGENT_BACKEND} backend listening on http://localhost:${info.port}`)
	if (AGENT_BACKEND === 'bedrock') {
		console.log(`AGENT_BEDROCK_MODEL=${BEDROCK_MODEL} AWS_REGION=${env.AWS_REGION}`)
	} else {
		console.log(`LOCAL_MODEL_URL=${env.LOCAL_MODEL_URL}`)
	}
})

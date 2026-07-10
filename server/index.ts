import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { DebugPart } from '../shared/schema/PromptPartDefinitions'
import { AgentPrompt } from '../shared/types/AgentPrompt'
import { AgentModelName } from '../shared/models'
import { AgentService } from '../worker/do/AgentService'
import { createSSEStreamResponse } from '../worker/do/createSSEStreamResponse'
import { ModelEnvironment } from '../worker/environment'
import { resolveBackendModel, resolveBedrockModel } from './resolveBackendModel'

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
const BEDROCK_MODEL: AgentModelName = resolveBedrockModel(process.env.AGENT_BEDROCK_MODEL)

const service = new AgentService(env)

const app = new Hono()

app.post('/stream', async (c) => {
	const prompt = (await c.req.json()) as AgentPrompt

	// Gated the same way as the Worker-side debug logging (AgentService), so a
	// per-request message snippet isn't logged unconditionally in local dev.
	const debugPart = prompt.debug as DebugPart | undefined
	if (debugPart?.logMessages) {
		const agentMsgs = (prompt as any).messages?.agentMessages
		console.log('[STREAM] mode:', prompt.mode?.modeType, 'actions:', prompt.mode?.actionTypes?.length,
			agentMsgs ? `msg: "${(agentMsgs[0] || '').slice(0, 100)}"` : '')
	}

	// Pin the model per backend mode. In 'bedrock' mode every prompt runs on the
	// chosen Bedrock model. In 'local' mode force `local` unless the client picked
	// a passthrough (bedrock) model.
	if (prompt.modelName) {
		prompt.modelName.modelName = resolveBackendModel(
			AGENT_BACKEND,
			BEDROCK_MODEL,
			prompt.modelName.modelName
		)
	}

	return createSSEStreamResponse((signal) => service.stream(prompt, signal))
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

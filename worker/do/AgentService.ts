import { AmazonBedrockProvider, createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { AnthropicProvider, createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from '@ai-sdk/google'
import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai'
import { LanguageModel, streamText } from 'ai'
import { AgentModelName, getAgentModelDefinition, isValidModelName } from '../../shared/models'
import { DebugPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { Streaming } from '../../shared/types/Streaming'
import { ModelEnvironment } from '../environment'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { getModelName } from '../prompt/getModelName'
import { buildStreamConfig, ResponseFormat } from './buildStreamConfig'
import { estimatePromptChars } from './estimatePromptChars'
import { parseActionStream } from './parseActionStream'

export class AgentService {
	openai: OpenAIProvider
	anthropic: AnthropicProvider
	google: GoogleGenerativeAIProvider
	bedrock: AmazonBedrockProvider
	local: OpenAIProvider
	private localBaseURL?: string

	constructor(env: ModelEnvironment) {
		this.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
		this.anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
		this.google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
		// Bedrock. Prefer the bearer token (AWS_BEARER_TOKEN_BEDROCK); the SDK reads
		// it from the environment, but pass it explicitly so the Cloudflare path (no
		// process.env) works too. With no bearer token, fall back to SigV4 from
		// temporary SSO credentials (access key + secret + session token). Region
		// scopes which inference profiles resolve; SigV4 signs per-request, so the
		// region is independent of where the SSO profile was configured.
		this.bedrock = createAmazonBedrock(
			env.AWS_BEARER_TOKEN_BEDROCK
				? { apiKey: env.AWS_BEARER_TOKEN_BEDROCK, region: env.AWS_REGION }
				: {
						region: env.AWS_REGION,
						accessKeyId: env.AWS_ACCESS_KEY_ID,
						secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
						sessionToken: env.AWS_SESSION_TOKEN,
					}
		)
		// Local koboldcpp endpoint over the OpenAI-compatible API. Reuses the OpenAI
		// SDK, so no new inference dependency. apiKey is a noop koboldcpp ignores.
		this.localBaseURL = env.LOCAL_MODEL_URL
		this.local = createOpenAI({ baseURL: this.localBaseURL, apiKey: 'sk-noop' })
	}

	getModel(modelName: AgentModelName): LanguageModel {
		const modelDefinition = getAgentModelDefinition(modelName)
		const provider = modelDefinition.provider
		// koboldcpp implements the OpenAI /v1/chat/completions API, not the newer
		// /v1/responses API the SDK defaults to. Pin the local model to chat.
		if (provider === 'local') {
			return this.local.chat(modelDefinition.id)
		}
		return this[provider](modelDefinition.id)
	}

	/**
	 * Build a local model whose requests carry a `response_format`. The AI SDK's
	 * OpenAI provider validates provider options and drops unknown fields, so we
	 * splice `response_format` into the request body with a custom `fetch`.
	 * koboldcpp converts the JSON schema to a grammar, constraining the model to
	 * valid action JSON.
	 */
	private getLocalModelWithResponseFormat(
		modelId: string,
		responseFormat: ResponseFormat
	): LanguageModel {
		const provider = createOpenAI({
			baseURL: this.localBaseURL,
			apiKey: 'sk-noop',
			fetch: async (input, init) => {
				if (init?.body && typeof init.body === 'string') {
					try {
						const body = JSON.parse(init.body)
						body.response_format = responseFormat
						init = { ...init, body: JSON.stringify(body) }
					} catch (error) {
						// The body is always JSON here; a parse failure means the
						// local-path invariant (response_format grammar constraint)
						// is broken. Fail loudly rather than silently dropping it.
						console.error(
							'Failed to inject response_format into local model request body:',
							error
						)
						throw error
					}
				}
				return fetch(input, init)
			},
		})
		return provider.chat(modelId)
	}

	async *stream(
		prompt: AgentPrompt,
		signal?: AbortSignal
	): AsyncGenerator<Streaming<AgentAction>> {
		try {
			for await (const event of this.streamActions(prompt, signal)) {
				yield event
			}
		} catch (error: any) {
			console.error('Stream error:', error)
			throw error
		}
	}

	private async *streamActions(
		prompt: AgentPrompt,
		signal?: AbortSignal
	): AsyncGenerator<Streaming<AgentAction>> {
		const requestStartTime = Date.now()
		const modelName = getModelName(prompt)
		let model = this.getModel(modelName)

		if (typeof model === 'string') {
			throw new Error('Model is a string, not a LanguageModel')
		}

		const modelDefinition = getAgentModelDefinition(modelName)

		// Guard that the SDK model id is one we know about. Two providers bypass it
		// because their `id` is not the definition `name`: the local path (koboldcpp
		// reports its own loaded model id) and bedrock (id is a region-scoped
		// inference profile id like `eu.anthropic.claude-...`).
		const idIsProfileId = modelDefinition.provider === 'local' || modelDefinition.provider === 'bedrock'
		if (!idIsProfileId && !isValidModelName(model.modelId)) {
			throw new Error(`Model ${model.modelId} is not in AGENT_MODEL_DEFINITIONS`)
		}

		const { messages, providerOptions, canForceResponseStart, responseFormat } = buildStreamConfig(
			prompt,
			modelDefinition
		)

		// Local path: rebuild the model so its requests carry the schema-constrained
		// response_format koboldcpp needs to emit valid action JSON.
		if (responseFormat) {
			model = this.getLocalModelWithResponseFormat(model.modelId, responseFormat)
		}

		// Log an estimated prompt token count for the local path, so an operator can
		// confirm the system prompt fits the koboldcpp --contextsize before it is
		// silently truncated. Estimate only (no tokenizer): ~4 chars per token.
		if (modelDefinition.provider === 'local') {
			const promptChars = estimatePromptChars(messages)
			console.log(`[local] estimated prompt tokens: ~${Math.ceil(promptChars / 4)}`)
		}

		// Check for debug flags and log if enabled
		const debugPart = prompt.debug as DebugPart | undefined
		if (debugPart) {
			if (debugPart.logSystemPrompt) {
				const promptWithoutSchema = buildSystemPrompt(prompt, { withSchema: false })
				console.log('[DEBUG] System Prompt (without schema):\n', promptWithoutSchema)
			}
			if (debugPart.logMessages) {
				console.log('[DEBUG] Messages:\n', JSON.stringify(messages, null, 2))
			}
		}

		try {
			// `onError` is log-only in the AI SDK: errors are not surfaced through
			// `textStream`, so capture here and re-throw after the consume loop.
			let streamError: unknown = null
			const result = streamText({
				model,
				messages,
				maxOutputTokens: 65536,
				...(modelDefinition.provider === 'bedrock' ? {} : { temperature: 0 }),
				providerOptions,
				abortSignal: signal,
				onAbort() {
					console.warn('Stream actions aborted')
				},
				onError: (e) => {
					console.error('Stream text error:', e)
					streamError = e
				},
				onFinish: ({ finishReason, usage }) => {
					const elapsedMs = Date.now() - requestStartTime
					console.log(`[STREAM] finished: reason=${finishReason} tokens=${usage?.totalTokens ?? '?'} (in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'}) elapsedMs=${elapsedMs}`)
				},
			})
			const { textStream } = result

			const initialBuffer = canForceResponseStart ? '{"actions": [{"_type":' : ''
			const parser = parseActionStream(textStream, initialBuffer, () => streamError !== null)
			let finalState: { buffer: string; cursor: number } | undefined
			while (true) {
				const { value, done } = await parser.next()
				if (done) {
					finalState = value
					break
				}
				yield value
			}

			console.log(
				`[STREAM] buffer length: ${finalState?.buffer.length ?? 0}, actions yielded: ${finalState?.cursor ?? 0}`
			)
			if (finalState?.cursor === 0 && (finalState?.buffer.length ?? 0) > 0) {
				console.log(`[STREAM] NO ACTIONS PARSED. Buffer start: "${finalState?.buffer.slice(0, 300)}"`)
			}

			// The AI SDK reports provider/model errors via `onError` (captured above)
			// rather than throwing from the stream, so re-throw here to surface them.
			if (streamError) throw streamError
		} catch (error: any) {
			console.error('streamActions error:', error)
			throw error
		}
	}
}

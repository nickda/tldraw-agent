/**
 * The inference configuration `AgentService` needs to construct its providers.
 * Shared by both backends: the Cloudflare `Environment` and the Node server.
 */
export interface ModelEnvironment {
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	GOOGLE_API_KEY: string

	// Base URL of a local OpenAI-compatible inference endpoint (koboldcpp).
	// Optional: only the 'local' backend reads it; the Cloudflare path ignores it.
	LOCAL_MODEL_URL?: string
}

export interface Environment extends ModelEnvironment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
}

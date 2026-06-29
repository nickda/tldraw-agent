/**
 * The inference configuration `AgentService` needs to construct its providers.
 * Shared by both backends: the Cloudflare `Environment` and the Node server.
 */
export interface ModelEnvironment {
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	GOOGLE_API_KEY: string

	// Amazon Bedrock auth. Two mutually-exclusive paths, both optional and read
	// only by the 'bedrock' provider:
	//   1. Bearer token (the AWS_BEARER_TOKEN_BEDROCK Claude Code uses). Takes
	//      precedence when set.
	//   2. SigV4 from temporary SSO credentials (access key + secret + session
	//      token), e.g. `aws configure export-credentials`. Used when no bearer
	//      token is present but an access key is.
	// AWS_REGION scopes which inference profiles the model ids resolve against.
	AWS_BEARER_TOKEN_BEDROCK?: string
	AWS_REGION?: string
	AWS_ACCESS_KEY_ID?: string
	AWS_SECRET_ACCESS_KEY?: string
	AWS_SESSION_TOKEN?: string

	// Base URL of a local OpenAI-compatible inference endpoint (koboldcpp).
	// Optional: only the 'local' backend reads it; the Cloudflare path ignores it.
	LOCAL_MODEL_URL?: string
}

export interface Environment extends ModelEnvironment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
}

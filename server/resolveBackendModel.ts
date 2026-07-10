import { AgentModelName, getAgentModelDefinition, isValidModelName } from '../shared/models'

/**
 * Resolve which Bedrock model the 'bedrock' backend pins every prompt to.
 * Falls back to a default when the override is missing, unknown, or names a
 * non-bedrock model.
 */
export function resolveBedrockModel(requested: string | undefined): AgentModelName {
	if (isValidModelName(requested) && getAgentModelDefinition(requested).provider === 'bedrock') {
		return requested
	}
	return 'bedrock-claude-sonnet-4-6'
}

/**
 * Resolve the model a request actually runs on, given the server's backend
 * mode. In 'bedrock' mode every prompt runs on the pinned Bedrock model. In
 * 'local' mode, every prompt is forced to `local` unless the client picked an
 * explicit Bedrock model, which passes through unchanged (so local vs.
 * Bedrock can be compared side-by-side from the same UI).
 */
export function resolveBackendModel(
	backend: 'local' | 'bedrock',
	bedrockModel: AgentModelName,
	requestedModelName: string | undefined
): AgentModelName {
	if (backend === 'bedrock') {
		return bedrockModel
	}
	if (isValidModelName(requestedModelName) && getAgentModelDefinition(requestedModelName).provider === 'bedrock') {
		return requestedModelName
	}
	return 'local'
}

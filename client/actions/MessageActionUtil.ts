import { MessageAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * Replace em dashes and en dashes with a comma, and strip double hyphens, so
 * no bee ever renders a dash the model reached for. Applied to all message
 * text since bees speak only through message actions.
 */
export function stripEmDashes(text: string): string {
	return text.replace(/\s*[—–]\s*/g, ', ').replace(/\s*--\s*/g, ', ')
}

export const MessageActionUtil = registerActionUtil(
	class MessageActionUtil extends AgentActionUtil<MessageAction> {
		static override type = 'message' as const

		override getInfo(action: Streaming<MessageAction>) {
			return {
				description: action.text ?? '',
				canGroup: () => false,
			}
		}

		override sanitizeAction(action: Streaming<MessageAction>, _helpers: AgentHelpers) {
			if (typeof action.text === 'string') {
				return { ...action, text: stripEmDashes(action.text) }
			}
			return action
		}
	}
)

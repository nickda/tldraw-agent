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
			// An Executor only gets to speak once, on the turn it's dispatched. Its
			// dispatch prompts come from the Planner or the coordinator (source
			// 'other-agent'); every later turn in the same dispatch (claiming the
			// next item, navigating, being told to keep drawing) is scheduled by the
			// Executor itself (source 'self'). The model would otherwise stay in
			// character and re-narrate, often verbatim, on each of those self turns.
			// Rejecting message actions on self-sourced Executor turns stops that at
			// one chokepoint instead of chasing every continuation prompt. The
			// Planner is unaffected: it legitimately messages on its own self-sourced
			// review rounds.
			if (this.agent.role === 'executor' && this.agent.requests.getActiveRequest()?.source === 'self') {
				return null
			}

			if (typeof action.text === 'string') {
				return { ...action, text: stripEmDashes(action.text) }
			}
			return action
		}
	}
)

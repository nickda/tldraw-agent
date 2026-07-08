import { structuredClone } from 'tldraw'
import { ChatHistoryPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/**
 * The chat history sent to the model grows without bound as an agent takes
 * more turns: every prior action (including large ones like writePlan) gets
 * re-sent as text on every subsequent prompt. Left uncapped, this makes
 * later turns in a long-running session (e.g. later review rounds in Team
 * Mode) send far more input tokens than earlier ones, which slows them down.
 * The canvas state and shared plan are already sent fresh each turn via
 * other prompt parts, so trimming to the most recent items doesn't lose the
 * agent's ability to act coherently.
 */
export const MAX_CHAT_HISTORY_ITEMS = 15

/** Keep only the most recent `MAX_CHAT_HISTORY_ITEMS` items, oldest first. */
export function capChatHistory(history: ChatHistoryItem[]): ChatHistoryItem[] {
	if (history.length <= MAX_CHAT_HISTORY_ITEMS) return history
	return history.slice(history.length - MAX_CHAT_HISTORY_ITEMS)
}

export const ChatHistoryPartUtil = registerPromptPartUtil(
	class ChatHistoryPartUtil extends PromptPartUtil<ChatHistoryPart> {
		static override type = 'chatHistory' as const

		override async getPart(_request: AgentRequest, helpers: AgentHelpers) {
			const history = capChatHistory(structuredClone(this.agent.chat.getHistory()))

			for (const historyItem of history) {
				if (historyItem.type !== 'prompt') continue

				// Offset and round the context items of each history item
				const contextItems = historyItem.contextItems.map((contextItem) => {
					const offsetContextItem = helpers.applyOffsetToContextItem(contextItem)
					return helpers.roundContextItem(offsetContextItem)
				})

				historyItem.contextItems = contextItems
			}

			return {
				type: 'chatHistory' as const,
				history,
			}
		}
	}
)

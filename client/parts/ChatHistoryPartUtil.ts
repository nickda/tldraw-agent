import { structuredClone } from 'tldraw'
import { ChatHistoryPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { capChatHistory, MAX_CHAT_HISTORY_ITEMS } from '../utils/capChatHistory'
import { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export { capChatHistory, MAX_CHAT_HISTORY_ITEMS }

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

import { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'

/**
 * The chat history sent to the model (and persisted to localStorage) grows
 * without bound as an agent takes more turns: every prior action (including
 * large ones like writePlan, each carrying a full RecordsDiff) gets kept
 * verbatim. Left uncapped, a long-running session risks exhausting the
 * localStorage quota, not just slowing down later prompts.
 */
export const MAX_CHAT_HISTORY_ITEMS = 15

/** Keep only the most recent `MAX_CHAT_HISTORY_ITEMS` items, oldest first. */
export function capChatHistory(history: ChatHistoryItem[]): ChatHistoryItem[] {
	if (history.length <= MAX_CHAT_HISTORY_ITEMS) return history
	return history.slice(history.length - MAX_CHAT_HISTORY_ITEMS)
}

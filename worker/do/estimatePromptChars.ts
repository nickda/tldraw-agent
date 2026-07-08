import { ModelMessage } from 'ai'

/**
 * Sum the text length of a message's content, whether it's a plain string
 * or an array of parts (text/image/file). Used to log an approximate prompt
 * size for the local backend; no tokenizer is available there.
 */
export function estimatePromptChars(messages: ModelMessage[]): number {
	return messages.reduce((sum, message) => {
		const content = message.content
		if (typeof content === 'string') return sum + content.length
		if (!Array.isArray(content)) return sum
		return (
			sum +
			content.reduce((partSum, part) => partSum + (part.type === 'text' ? part.text.length : 0), 0)
		)
	}, 0)
}

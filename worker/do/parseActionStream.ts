import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { closeAndParseJson } from './closeAndParseJson'

/**
 * Consume a stream of raw text chunks (as emitted by the model) and yield each
 * action as it becomes available, first as an incomplete partial and then once
 * more as complete. A single chunk can cause the parsed action count to jump
 * by more than one (e.g. two short actions land in the same chunk), so every
 * newly-completed action in that jump is yielded, not just the first.
 */
export async function* parseActionStream(
	textStream: AsyncIterable<string>,
	initialBuffer = ''
): AsyncGenerator<Streaming<AgentAction>, { buffer: string; cursor: number }> {
	let buffer = initialBuffer
	let cursor = 0
	let maybeIncompleteAction: AgentAction | null = null
	let startTime = Date.now()

	for await (const text of textStream) {
		buffer += text

		const partialObject = closeAndParseJson(buffer)
		if (!partialObject) continue

		const actions = partialObject.actions
		if (!Array.isArray(actions)) continue
		if (actions.length === 0) continue

		// If the events list is ahead of the cursor, we know we've completed one or
		// more events. A single chunk can complete more than one action at once, so
		// advance the cursor once per newly-completed action rather than just once.
		while (actions.length > cursor) {
			const action = actions[cursor - 1] as AgentAction
			if (action) {
				yield {
					...action,
					complete: true,
					time: Date.now() - startTime,
				}
				maybeIncompleteAction = null
			}
			cursor++
		}

		// Now let's check the (potentially new) current event
		// And let's yield it in its (potentially incomplete) state
		const action = actions[cursor - 1] as AgentAction
		if (action) {
			// If we don't have an incomplete event yet, this is the start of a new one
			if (!maybeIncompleteAction) {
				startTime = Date.now()
			}

			maybeIncompleteAction = action

			// Yield the potentially incomplete event
			yield {
				...action,
				complete: false,
				time: Date.now() - startTime,
			}
		}
	}

	// If we've finished receiving events, but there's still an incomplete event, we need to complete it
	if (maybeIncompleteAction) {
		yield {
			...maybeIncompleteAction,
			complete: true,
			time: Date.now() - startTime,
		}
	}

	return { buffer, cursor }
}

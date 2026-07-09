import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { extractActionsFromBuffer } from './closeAndParseJson'

/**
 * Consume a stream of raw text chunks (as emitted by the model) and yield each
 * action as it becomes available, first as an incomplete partial and then once
 * more as complete. A single chunk can cause the parsed action count to jump
 * by more than one (e.g. two short actions land in the same chunk), so every
 * newly-completed action in that jump is yielded, not just the first.
 *
 * `hasError`, if provided, is checked once the stream ends. The AI SDK
 * reports provider/model errors via a separate `onError` callback rather than
 * throwing from `textStream`, so the `for await` loop below can exit
 * normally (as if the stream finished cleanly) even when the model call
 * actually failed partway through. If `hasError()` is true at that point, the
 * trailing incomplete action is dropped instead of being flushed as
 * `complete: true`: a truncated response from a failed call should never be
 * handed to a caller as a finished action.
 */
export async function* parseActionStream(
	textStream: AsyncIterable<string>,
	initialBuffer = '',
	hasError: () => boolean = () => false
): AsyncGenerator<Streaming<AgentAction>, { buffer: string; cursor: number }> {
	let buffer = initialBuffer
	let cursor = 0
	let maybeIncompleteAction: AgentAction | null = null
	let startTime = Date.now()

	for await (const text of textStream) {
		buffer += text

		const actions = extractActionsFromBuffer(buffer)
		if (!actions) continue
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

	// If we've finished receiving events, but there's still an incomplete event,
	// we need to complete it, unless the stream ended because of an error: a
	// truncated action from a failed call must not be reported as complete.
	if (maybeIncompleteAction && !hasError()) {
		yield {
			...maybeIncompleteAction,
			complete: true,
			time: Date.now() - startTime,
		}
	}

	return { buffer, cursor }
}

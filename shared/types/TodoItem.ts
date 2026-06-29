import { BoxModel } from 'tldraw'
import { TodoId } from './ids-schema'

export interface TodoItem {
	id: TodoId
	text: string
	status: 'todo' | 'in-progress' | 'done'

	/**
	 * The id of the agent that has claimed this item, or unset if unclaimed.
	 * Used by the Shared Plan in Team Mode; the single-agent todo list leaves
	 * this unset.
	 */
	assignee?: string

	/**
	 * The canvas region the item's work must stay inside. Set by the Planner
	 * when it writes the Shared Plan so concurrent Executors draw in disjoint
	 * regions. Unset for the single-agent todo list.
	 */
	bounds?: BoxModel
}

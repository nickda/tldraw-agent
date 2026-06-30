import { Editor, EditorAtom } from 'tldraw'
import { TodoItem } from '../../../shared/types/TodoItem'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { claimPlanItem, SharedPlan } from './sharedPlan'

/**
 * Manager for the Shared Plan in Team Mode.
 *
 * The Shared Plan is the single ordered list of Plan Items the Planner writes
 * and the Executors claim from. It is stored in an EditorAtom so action utils
 * that only hold an `editor` can reach it, mirroring
 * `AgentAppAgentsManager.$agents`.
 *
 * The plan and the review-round counter are ephemeral (in-memory only): a
 * mid-run reload returns the Fairies to idle rather than resuming orphaned
 * claims. Already-drawn shapes survive via the tldraw store.
 *
 * This slice provides the data foundation and lifecycle only. The reactive
 * coordinator (dispatch + Review Loop) is wired in a later slice.
 */
export class AgentAppPlanManager extends BaseAgentAppManager {
	/**
	 * Static EditorAtom containing the Shared Plan.
	 * This allows action utils to access the plan without the full app.
	 */
	static $plan = new EditorAtom<SharedPlan>('sharedPlan', () => [])

	/**
	 * Static EditorAtom tracking the current review round. The build counts as
	 * round 0; the Review Loop increments it and is hard-capped (see
	 * `MAX_REVIEW_ROUNDS`).
	 */
	static $reviewRound = new EditorAtom<number>('sharedPlanReviewRound', () => 0)

	/**
	 * Get the Shared Plan for an editor.
	 * Use this static method from action utils that only have the editor.
	 */
	static getPlan(editor: Editor): SharedPlan {
		return AgentAppPlanManager.$plan.get(editor)
	}

	/**
	 * Claim the next available Plan Item for an agent, writing the result back to
	 * the shared atom. Returns the claimed item, or `null` if none was claimable.
	 *
	 * The read-modify-write is synchronous, so two Executors interleaving at
	 * `await` points cannot claim the same item.
	 */
	static claim(editor: Editor, agentId: string): TodoItem | null {
		const result = claimPlanItem(AgentAppPlanManager.$plan.get(editor), agentId)
		if (!result) {
			return null
		}
		AgentAppPlanManager.$plan.set(editor, result.plan)
		return result.item
	}

	/**
	 * Get the current review round.
	 */
	static getReviewRound(editor: Editor): number {
		return AgentAppPlanManager.$reviewRound.get(editor)
	}

	/**
	 * Get the Shared Plan.
	 */
	getPlan(): SharedPlan {
		return AgentAppPlanManager.$plan.get(this.app.editor)
	}

	/**
	 * Replace the Shared Plan. Called by the Planner when it writes the plan.
	 */
	setPlan(plan: SharedPlan): void {
		AgentAppPlanManager.$plan.set(this.app.editor, plan)
	}

	/**
	 * Get the current review round.
	 */
	getReviewRound(): number {
		return AgentAppPlanManager.$reviewRound.get(this.app.editor)
	}

	/**
	 * Increment the review round, returning the new value.
	 */
	incrementReviewRound(): number {
		const next = AgentAppPlanManager.$reviewRound.get(this.app.editor) + 1
		AgentAppPlanManager.$reviewRound.set(this.app.editor, next)
		return next
	}

	/**
	 * Reset the Shared Plan and review counter to their initial empty state.
	 */
	reset(): void {
		AgentAppPlanManager.$plan.set(this.app.editor, [])
		AgentAppPlanManager.$reviewRound.set(this.app.editor, 0)
	}

	/**
	 * Dispose of the manager, clearing the Shared Plan.
	 */
	override dispose(): void {
		this.reset()
		super.dispose()
	}
}

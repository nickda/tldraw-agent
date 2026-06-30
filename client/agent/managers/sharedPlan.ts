import { TodoItem } from '../../../shared/types/TodoItem'

/**
 * The Shared Plan: the single ordered list of Plan Items the Planner writes and
 * the Executors claim from. Unlike the per-agent todo list, there is one owner
 * of truth visible to every agent in a Team Mode run.
 */
export type SharedPlan = TodoItem[]

/**
 * The maximum number of review rounds in a Team Mode run: the inspection after
 * the build, plus at most one fix pass. The Review Loop is hard-capped here so
 * the Fairies cannot loop forever burning time and tokens.
 */
export const MAX_REVIEW_ROUNDS = 3

/**
 * The result of a successful claim: the updated plan and the item that was
 * claimed.
 */
export interface ClaimResult {
	plan: SharedPlan
	item: TodoItem
}

/**
 * Claim the next available Plan Item for an agent.
 *
 * A pure compare-and-set: returns a new plan with the first `todo` item stamped
 * `in-progress` and assigned to `agentId`, along with the claimed item. Returns
 * `null` if no item is claimable (empty plan, or every item already
 * `in-progress`/`done`).
 *
 * This is safe without locks because all agents run in one JavaScript event
 * loop on one editor: a synchronous read-modify-write on the shared atom cannot
 * interleave mid-update, so two Executors cannot claim the same item.
 */
export function claimPlanItem(plan: SharedPlan, agentId: string): ClaimResult | null {
	const index = plan.findIndex((item) => item.status === 'todo')
	if (index === -1) {
		return null
	}

	const claimed: TodoItem = {
		...plan[index],
		status: 'in-progress',
		assignee: agentId,
	}

	const nextPlan = plan.slice()
	nextPlan[index] = claimed

	return { plan: nextPlan, item: claimed }
}

/**
 * Decide whether the Planner should start a Review Loop round.
 *
 * True only when the plan has drained (no `todo`, no `in-progress`), every
 * Executor is idle, and the round cap has not been reached. The cap makes the
 * Review Loop terminate: once `reviewRound` reaches {@link MAX_REVIEW_ROUNDS},
 * the Planner emits a final summary instead of triggering another review.
 */
export function shouldStartReview({
	plan,
	executorsIdle,
	reviewRound,
}: {
	plan: SharedPlan
	executorsIdle: boolean
	reviewRound: number
}): boolean {
	if (reviewRound >= MAX_REVIEW_ROUNDS) {
		return false
	}
	if (!executorsIdle) {
		return false
	}
	// All items done OR all items done/in-progress with no todos left
	// (in-progress items with idle executors means the executor finished
	// but didn't create shapes, e.g., due to sanitization errors)
	return plan.every((item) => item.status === 'done' || item.status === 'in-progress')
}

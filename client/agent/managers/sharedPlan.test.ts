import { describe, expect, test } from 'bun:test'
import { TodoIdSchema } from '../../../shared/types/ids-schema'
import { TodoItem } from '../../../shared/types/TodoItem'
import { claimPlanItem, MAX_REVIEW_ROUNDS, shouldStartReview } from './sharedPlan'

function item(id: number, status: TodoItem['status'], assignee?: string): TodoItem {
	return {
		id: TodoIdSchema.parse(id),
		text: `item ${id}`,
		status,
		...(assignee ? { assignee } : {}),
	}
}

describe('claimPlanItem', () => {
	test('two sequential claims on the same todo item: second returns null (no double-claim)', () => {
		const plan = [item(1, 'todo')]

		const first = claimPlanItem(plan, 'agent-a')
		expect(first).not.toBeNull()
		expect(first!.item.status).toBe('in-progress')
		expect(first!.item.assignee).toBe('agent-a')

		// A second executor claiming against the already-updated plan gets nothing.
		const second = claimPlanItem(first!.plan, 'agent-b')
		expect(second).toBeNull()
	})

	test('picks the first todo item, skipping in-progress and done', () => {
		const plan = [item(1, 'done'), item(2, 'in-progress', 'agent-a'), item(3, 'todo'), item(4, 'todo')]

		const result = claimPlanItem(plan, 'agent-b')
		expect(result).not.toBeNull()
		expect(result!.item.id).toBe(TodoIdSchema.parse(3))
		expect(result!.item.assignee).toBe('agent-b')
	})

	test('stamps assignee and in-progress only on the claimed item, leaving others untouched', () => {
		const plan = [item(1, 'todo'), item(2, 'todo')]

		const result = claimPlanItem(plan, 'agent-a')
		expect(result!.plan[0]).toEqual(item(1, 'in-progress', 'agent-a'))
		expect(result!.plan[1]).toEqual(item(2, 'todo'))
	})

	test('does not mutate the input plan', () => {
		const plan = [item(1, 'todo')]
		claimPlanItem(plan, 'agent-a')
		expect(plan[0].status).toBe('todo')
		expect(plan[0].assignee).toBeUndefined()
	})

	test('empty plan returns null', () => {
		expect(claimPlanItem([], 'agent-a')).toBeNull()
	})

	test('all-claimed plan (in-progress / done only) returns null', () => {
		const plan = [item(1, 'done'), item(2, 'in-progress', 'agent-a')]
		expect(claimPlanItem(plan, 'agent-b')).toBeNull()
	})
})

describe('shouldStartReview', () => {
	test('true when all items done, executors idle, and under the round cap', () => {
		const plan = [item(1, 'done'), item(2, 'done')]
		expect(shouldStartReview({ plan, executorsIdle: true, reviewRound: 0 })).toBe(true)
	})

	test('false when a todo item is still outstanding', () => {
		const plan = [item(1, 'done'), item(2, 'todo')]
		expect(shouldStartReview({ plan, executorsIdle: true, reviewRound: 0 })).toBe(false)
	})

	test('false when an item is still in-progress', () => {
		const plan = [item(1, 'done'), item(2, 'in-progress', 'agent-a')]
		expect(shouldStartReview({ plan, executorsIdle: true, reviewRound: 0 })).toBe(false)
	})

	test('false when any executor is busy', () => {
		const plan = [item(1, 'done')]
		expect(shouldStartReview({ plan, executorsIdle: false, reviewRound: 0 })).toBe(false)
	})

	test('false once reviewRound reaches the cap', () => {
		const plan = [item(1, 'done')]
		expect(shouldStartReview({ plan, executorsIdle: true, reviewRound: MAX_REVIEW_ROUNDS })).toBe(false)
	})

	test('true on the final allowed round (cap minus one)', () => {
		const plan = [item(1, 'done')]
		expect(
			shouldStartReview({ plan, executorsIdle: true, reviewRound: MAX_REVIEW_ROUNDS - 1 })
		).toBe(true)
	})

	test('empty plan with idle executors is reviewable', () => {
		expect(shouldStartReview({ plan: [], executorsIdle: true, reviewRound: 0 })).toBe(true)
	})
})

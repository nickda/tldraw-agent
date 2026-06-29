import { describe, expect, test } from 'bun:test'
import { AGENT_MODE_DEFINITIONS, getAgentModeDefinition } from './AgentModeDefinitions'

// The draw actions an agent uses to put or change geometry on the canvas. The
// Planner's grammar must omit all of them; the Executor's must include them.
const DRAW_ACTIONS = [
	'create',
	'update',
	'delete',
	'label',
	'move',
	'place',
	'bringToFront',
	'sendToBack',
	'rotate',
	'resize',
	'align',
	'distribute',
	'stack',
	'clear',
	'pen',
] as const

// The plan-writing actions only the Planner may emit. The Executor's grammar
// must omit all of them so it cannot rewrite the plan.
const PLAN_WRITING_ACTIONS = ['writePlan', 'dispatchExecutors', 'delegateFix'] as const

function actionsFor(type: 'working' | 'planning' | 'executing'): readonly string[] {
	const def = getAgentModeDefinition(type)
	if (!def.active) throw new Error(`expected ${type} to be an active mode`)
	return def.actions
}

describe('AGENT_MODE_DEFINITIONS', () => {
	test('planning and executing modes exist alongside the unchanged working mode', () => {
		const types = AGENT_MODE_DEFINITIONS.map((m) => m.type)
		expect(types).toContain('working')
		expect(types).toContain('planning')
		expect(types).toContain('executing')
	})

	test('working mode is unchanged: still includes draw actions', () => {
		const working = actionsFor('working')
		for (const action of DRAW_ACTIONS) {
			expect(working).toContain(action)
		}
	})

	describe('planning mode (Planner)', () => {
		test('excludes every draw action', () => {
			const planning = actionsFor('planning')
			for (const action of DRAW_ACTIONS) {
				expect(planning).not.toContain(action)
			}
		})

		test('includes the plan-writing actions', () => {
			const planning = actionsFor('planning')
			for (const action of PLAN_WRITING_ACTIONS) {
				expect(planning).toContain(action)
			}
		})

		test('cannot claim plan items (that is the Executor job)', () => {
			expect(actionsFor('planning')).not.toContain('claimItem')
		})
	})

	describe('executing mode (Executor)', () => {
		test('excludes the plan-writing actions writePlan/dispatchExecutors/delegateFix', () => {
			const executing = actionsFor('executing')
			for (const action of PLAN_WRITING_ACTIONS) {
				expect(executing).not.toContain(action)
			}
		})

		test('can claim plan items and draw', () => {
			const executing = actionsFor('executing')
			expect(executing).toContain('claimItem')
			expect(executing).toContain('create')
			expect(executing).toContain('pen')
		})
	})
})

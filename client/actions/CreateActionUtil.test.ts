import { describe, expect, mock, test } from 'bun:test'
import { CreateActionUtil } from './CreateActionUtil'

/**
 * Regression test for issue #53: concurrently streaming shapes from different
 * agents that lack an explicit id used to all fall back to the same fixed
 * placeholder id ('streaming-shape'), so in Team Mode (multiple executors
 * streaming at once) their in-progress shapes collided and clobbered each
 * other. The fallback id is now scoped to the agent producing the shape.
 */
function makeUtil(agentId: string) {
	const createdShapes: any[] = []
	const editor = {
		getHighestIndexForParent: () => 'a1',
		getCurrentPageId: () => 'page:page',
		getShapePageBounds: () => ({ x: 0, y: 0, w: 40, h: 20 }),
		createShape: (shape: any) => createdShapes.push(shape),
		createBinding: mock(() => {}),
	}
	const util = new (CreateActionUtil as any)({ id: agentId, editor })
	const helpers = {
		removeOffsetFromShapePartial: (shape: any) => shape,
	}
	return { util, helpers, createdShapes }
}

describe('CreateActionUtil: streaming shape id scoping', () => {
	test('two agents streaming a shape without an explicit id get distinct shape ids', () => {
		const agentA = makeUtil('agent-A')
		const agentB = makeUtil('agent-B')

		const streamingAction = {
			complete: false,
			time: 0,
			shape: { _type: 'text', x: 0, y: 0, text: 'hello' },
		} as any

		agentA.util.applyAction(streamingAction, agentA.helpers as any)
		agentB.util.applyAction(streamingAction, agentB.helpers as any)

		expect(agentA.createdShapes).toHaveLength(1)
		expect(agentB.createdShapes).toHaveLength(1)
		expect(agentA.createdShapes[0].id).not.toBe(agentB.createdShapes[0].id)
	})

	test('the same agent streaming twice without an id reuses that agent-scoped id (so later deltas update the same shape)', () => {
		const agent = makeUtil('agent-A')
		const streamingAction = {
			complete: false,
			time: 0,
			shape: { _type: 'text', x: 0, y: 0, text: 'partial' },
		} as any

		agent.util.applyAction(streamingAction, agent.helpers as any)
		agent.util.applyAction(streamingAction, agent.helpers as any)

		expect(agent.createdShapes[0].id).toBe(agent.createdShapes[1].id)
	})
})

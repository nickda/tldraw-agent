import { describe, expect, test, mock } from 'bun:test'
import { AgentAppTeamManager } from './AgentAppTeamManager'

/**
 * Tests for AgentAppTeamManager's lifecycle-safety fixes (issue #52).
 *
 * Covers: the static singleton `instance` reference being cleared on
 * disposal (so static calls with no active instance are a safe no-op rather
 * than misrouting to a disposed instance), and disposal not resurrecting a
 * solo agent that immediately gets disposed again.
 */

function createFakeApp() {
	const deletedAgentIds: string[] = []
	const ensureAtLeastOneAgentCalls: number[] = []

	const app = {
		editor: { getViewportPageBounds: () => ({ x: 0, y: 0, w: 1000, h: 1000 }) },
		agents: {
			getAgents: () => [],
			deleteAgent: (id: string) => {
				deletedAgentIds.push(id)
				return true
			},
			createAgent: mock(() => ({ id: 'fake-planner' }) as any),
			ensureAtLeastOneAgent: mock(() => {
				ensureAtLeastOneAgentCalls.push(1)
				return { id: 'restored-solo' } as any
			}),
		},
		plan: {
			incrementReviewRound: mock(() => 1),
		},
	} as any

	return { app, deletedAgentIds, ensureAtLeastOneAgentCalls }
}

describe('AgentAppTeamManager static singleton', () => {
	test('disposing clears the static instance reference', () => {
		const { app } = createFakeApp()
		const manager = new AgentAppTeamManager(app)

		// Static calls route to the live instance while active.
		const grumbleSpy = mock(() => {})
		;(manager as any).grumbleAboutSlacker = grumbleSpy
		AgentAppTeamManager.triggerSlackGrumble('WannaBee')
		expect(grumbleSpy).toHaveBeenCalledTimes(1)

		manager.dispose()

		// After disposal, static calls must not reach the disposed instance.
		grumbleSpy.mockClear()
		AgentAppTeamManager.triggerSlackGrumble('WannaBee')
		expect(grumbleSpy).not.toHaveBeenCalled()
	})

	test('a second manager instance becomes the one static calls route to', () => {
		const { app: appA } = createFakeApp()
		const { app: appB } = createFakeApp()
		const managerA = new AgentAppTeamManager(appA)
		const managerB = new AgentAppTeamManager(appB)

		const spyA = mock(() => {})
		const spyB = mock(() => {})
		;(managerA as any).grumbleAboutSlacker = spyA
		;(managerB as any).grumbleAboutSlacker = spyB

		AgentAppTeamManager.triggerSlackGrumble('WannaBee')
		expect(spyA).not.toHaveBeenCalled()
		expect(spyB).toHaveBeenCalledTimes(1)

		// Disposing the non-current instance must not clear the live one.
		managerA.dispose()
		spyB.mockClear()
		AgentAppTeamManager.triggerSlackGrumble('WannaBee')
		expect(spyB).toHaveBeenCalledTimes(1)
	})
})

describe('AgentAppTeamManager disposal', () => {
	test('dispose() does not resurrect a solo agent that gets immediately disposed again', () => {
		const { app, ensureAtLeastOneAgentCalls } = createFakeApp()
		const manager = new AgentAppTeamManager(app)
		// Simulate an active team without going through the real activate() flow.
		;(manager as any).planner = { id: 'planner-1' }
		;(manager as any).executors = [{ id: 'exec-1' }, { id: 'exec-2' }]

		manager.dispose()

		expect(ensureAtLeastOneAgentCalls.length).toBe(0)
	})

	test('reset() outside of disposal still restores a solo agent when the team was active', () => {
		const { app, ensureAtLeastOneAgentCalls } = createFakeApp()
		const manager = new AgentAppTeamManager(app)
		;(manager as any).planner = { id: 'planner-1' }
		;(manager as any).executors = [{ id: 'exec-1' }, { id: 'exec-2' }]

		manager.reset()

		expect(ensureAtLeastOneAgentCalls.length).toBe(1)
	})
})

describe('AgentAppTeamManager review guard', () => {
	test('reviewGuard releases once the planner stops generating, not on a fixed timer', async () => {
		const { app } = createFakeApp()
		const manager = new AgentAppTeamManager(app)

		let generating = true
		;(manager as any).planner = {
			id: 'planner-1',
			requests: { isGenerating: () => generating },
			interrupt: mock(() => {}),
			chat: { push: mock(() => {}) },
		}
		;(manager as any).executors = []

		// Force the guard to true and simulate the wait-for-idle path directly,
		// since checkReviewLoop's plan/shouldStartReview gating is exercised by
		// sharedPlan.test.ts. This isolates the guard-release timing fix.
		;(manager as any).reviewGuard = true

		let resolved = false
		const waitPromise = (manager as any).waitForPlannerIdle().then(() => {
			resolved = true
		})

		// While the planner is still generating, the guard-release wait must not
		// resolve even well past the old fixed 100ms timer.
		await new Promise((resolve) => setTimeout(resolve, 250))
		expect(resolved).toBe(false)

		// Once generation actually finishes, the wait resolves.
		generating = false
		await waitPromise
		expect(resolved).toBe(true)
	})

	test('the planner never starting generating (never sets isGenerating) resolves after the bounded start-wait, not forever', async () => {
		const { app } = createFakeApp()
		const manager = new AgentAppTeamManager(app)

		// Simulates a scheduled request that throws before setIsPrompting(true),
		// so isGenerating() never flips true for this review. This still burns
		// the full bounded start-wait (isGenerating() staying false looks
		// identical to "hasn't started yet" from the helper's point of view),
		// but it MUST resolve rather than hang forever.
		;(manager as any).planner = {
			id: 'planner-1',
			requests: { isGenerating: () => false },
			interrupt: mock(() => {}),
			chat: { push: mock(() => {}) },
		}

		await (manager as any).waitForPlannerIdle()
	}, 6000)

	test('the planner disappearing mid-wait (reset/dispose racing in) does not hang', async () => {
		const { app } = createFakeApp()
		const manager = new AgentAppTeamManager(app)
		;(manager as any).planner = {
			id: 'planner-1',
			requests: { isGenerating: () => false },
			interrupt: mock(() => {}),
			chat: { push: mock(() => {}) },
		}

		const waitPromise = (manager as any).waitForPlannerIdle()
		await new Promise((resolve) => setTimeout(resolve, 10))
		;(manager as any).planner = null

		const start = Date.now()
		await waitPromise
		const elapsed = Date.now() - start

		// Once the planner is gone, the start-wait's `this.planner &&` guard
		// short-circuits immediately rather than waiting out the remaining
		// start-wait budget.
		expect(elapsed).toBeLessThan(200)
	})
})

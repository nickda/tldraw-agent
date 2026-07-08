import { describe, expect, test, mock } from 'bun:test'
import { AgentModeManager } from './AgentModeManager'

/**
 * Tests for AgentModeManager.setMode's same-mode no-op behavior (issue #50).
 *
 * setMode used to throw if asked to transition to the mode the agent was
 * already in. Several lifecycle hooks call setMode('idling') unconditionally
 * on cancel/end paths, so a benign "go idle while already idle" became an
 * uncaught exception feeding into the stuck-generating bug.
 */
describe('AgentModeManager.setMode', () => {
	function createManager() {
		const fakeAgent = {
			actions: { rebuildUtilsForMode: mock(() => {}) },
			todos: { reset: mock(() => {}) },
			userAction: { clearHistory: mock(() => {}) },
			context: { clear: mock(() => {}) },
			lints: { clearCreatedShapes: mock(() => {}), unlockCreatedShapes: mock(() => {}) },
			role: 'solo',
		} as any
		const manager = new AgentModeManager(fakeAgent)
		return { manager, fakeAgent }
	}

	test('transitioning to the current mode is a no-op, not a throw', () => {
		const { manager } = createManager()
		expect(manager.getCurrentModeType()).toBe('idling')
		expect(() => manager.setMode('idling')).not.toThrow()
		expect(manager.getCurrentModeType()).toBe('idling')
	})

	test('same-mode no-op does not rebuild action utils or run enter/exit hooks', () => {
		const { manager, fakeAgent } = createManager()
		manager.setMode('idling')
		expect(fakeAgent.actions.rebuildUtilsForMode).not.toHaveBeenCalled()
	})

	test('transitioning to a different mode still works and updates the mode', () => {
		const { manager, fakeAgent } = createManager()
		manager.setMode('working')
		expect(manager.getCurrentModeType()).toBe('working')
		expect(fakeAgent.actions.rebuildUtilsForMode).toHaveBeenCalledWith('working')
	})
})

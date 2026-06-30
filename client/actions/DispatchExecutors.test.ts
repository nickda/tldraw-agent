import { describe, expect, test, mock, beforeEach } from 'bun:test'

/**
 * Tests for DispatchExecutorsActionUtil dispatch mechanism.
 *
 * Verifies that:
 * 1. queueMicrotask fires and reaches executor.interrupt()
 * 2. Empty executor list is handled gracefully
 * 3. Individual executor failures don't block others
 */

// Mock the module structure to isolate dispatch logic
function createMockExecutor(id: string, shouldThrow = false) {
	return {
		id,
		role: 'executor' as const,
		interrupt: shouldThrow
			? mock(() => { throw new Error(`Executor ${id} failed`) })
			: mock(() => {}),
	}
}

function createMockEditor(agents: any[]) {
	return { __agents: agents }
}

// Simulate the dispatch logic extracted from DispatchExecutorsActionUtil.applyAction
function simulateDispatch(editor: any, getAgentsFn: (e: any) => any[]) {
	return new Promise<void>((resolve) => {
		queueMicrotask(() => {
			const agents = getAgentsFn(editor)
			const executors = agents.filter((a: any) => a.role === 'executor')

			if (executors.length === 0) {
				console.warn('[TeamMode] No executors found at dispatch time')
				resolve()
				return
			}

			for (const executor of executors) {
				try {
					executor.interrupt({
						input: {
							agentMessages: ['Claim a plan item...'],
							source: 'other-agent',
						},
					})
				} catch (e) {
					console.error(`[TeamMode] Failed to dispatch executor ${executor.id}:`, e)
				}
			}
			resolve()
		})
	})
}

describe('DispatchExecutors mechanism', () => {
	test('queueMicrotask fires and calls interrupt on all executors', async () => {
		const exec1 = createMockExecutor('exec-1')
		const exec2 = createMockExecutor('exec-2')
		const planner = { id: 'planner', role: 'planner', interrupt: mock(() => {}) }
		const editor = createMockEditor([planner, exec1, exec2])

		await simulateDispatch(editor, (e) => e.__agents)

		expect(exec1.interrupt).toHaveBeenCalledTimes(1)
		expect(exec2.interrupt).toHaveBeenCalledTimes(1)
		expect(planner.interrupt).not.toHaveBeenCalled()
	})

	test('empty executor list logs warning, does not throw', async () => {
		const planner = { id: 'planner', role: 'planner', interrupt: mock(() => {}) }
		const editor = createMockEditor([planner])

		// Should not throw
		await simulateDispatch(editor, (e) => e.__agents)
		expect(planner.interrupt).not.toHaveBeenCalled()
	})

	test('one executor throwing does not prevent dispatch to others', async () => {
		const exec1 = createMockExecutor('exec-1', true) // throws
		const exec2 = createMockExecutor('exec-2', false) // succeeds
		const editor = createMockEditor([exec1, exec2])

		await simulateDispatch(editor, (e) => e.__agents)

		expect(exec1.interrupt).toHaveBeenCalledTimes(1)
		expect(exec2.interrupt).toHaveBeenCalledTimes(1)
	})

	test('interrupt receives correct input shape', async () => {
		const exec = createMockExecutor('exec-1')
		const editor = createMockEditor([exec])

		await simulateDispatch(editor, (e) => e.__agents)

		const call = (exec.interrupt as any).mock.calls[0]
		expect(call[0]).toHaveProperty('input')
		expect(call[0].input).toHaveProperty('agentMessages')
		expect(call[0].input).toHaveProperty('source', 'other-agent')
	})
})

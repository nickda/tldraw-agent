import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { AgentRequestManager } from './managers/AgentRequestManager'

/**
 * Tests for the _schedule → prompt dispatch path.
 *
 * The key invariant: when isGenerating=false and schedule() is called,
 * prompt() must fire and must not silently swallow errors.
 *
 * We test via AgentRequestManager directly since TldrawAgent has deep deps
 * on Editor that are hard to mock. The logic under test is:
 *   - cancel() clears state but does NOT clear isPrompting
 *   - isGenerating() reflects $isPrompting atom value
 *   - After cancel(), isGenerating() remains true until prompt() lifecycle ends
 */

describe('AgentRequestManager.cancel()', () => {
	let manager: AgentRequestManager

	beforeEach(() => {
		// Minimal mock agent
		const fakeAgent = { id: 'test-agent', editor: {} } as any
		manager = new AgentRequestManager(fakeAgent)
	})

	test('cancel does NOT clear isPrompting (prompt lifecycle owns that)', () => {
		manager.setIsPrompting(true)
		manager.cancel()
		expect(manager.isGenerating()).toBe(true)
	})

	test('cancel clears scheduledRequest', () => {
		const fakeRequest = {
			source: 'self' as const,
			agentMessages: ['test'],
			userMessages: [],
			data: [],
			bounds: { x: 0, y: 0, w: 100, h: 100 },
			contextItems: [],
		}
		manager.setScheduledRequest(fakeRequest)
		manager.cancel()
		expect(manager.getScheduledRequest()).toBeNull()
	})

	test('cancel clears activeRequest', () => {
		const fakeRequest = {
			source: 'user' as const,
			agentMessages: ['test'],
			userMessages: ['test'],
			data: [],
			bounds: { x: 0, y: 0, w: 100, h: 100 },
			contextItems: [],
		}
		manager.setActiveRequest(fakeRequest)
		manager.cancel()
		expect(manager.getActiveRequest()).toBeNull()
	})

	test('cancel invokes cancelFn', () => {
		const cancelFn = mock(() => {})
		manager.setCancelFn(cancelFn)
		manager.cancel()
		expect(cancelFn).toHaveBeenCalledTimes(1)
	})
})

describe('AgentRequestManager state after interrupt pattern', () => {
	let manager: AgentRequestManager

	beforeEach(() => {
		const fakeAgent = { id: 'test-agent', editor: {} } as any
		manager = new AgentRequestManager(fakeAgent)
	})

	test('idle agent: isGenerating=false after cancel', () => {
		// Fresh agent, never prompted
		expect(manager.isGenerating()).toBe(false)
		manager.cancel()
		expect(manager.isGenerating()).toBe(false)
	})

	test('idle agent: schedule path would call prompt (isGenerating=false)', () => {
		// This simulates what _schedule checks before deciding to call prompt()
		expect(manager.isGenerating()).toBe(false)
		// An idle executor receiving interrupt() → cancel() + schedule():
		// cancel() is no-op on fresh agent
		// _schedule sees isGenerating=false → calls prompt() directly
	})

	test('active agent: isGenerating remains true after cancel', () => {
		// Simulates an agent mid-prompt that gets interrupted
		manager.setIsPrompting(true)
		manager.setCancelFn(() => {}) // simulate active cancelFn
		manager.cancel()
		// isPrompting stays true — prompt() async lifecycle will clear it
		expect(manager.isGenerating()).toBe(true)
	})

	test('active agent: scheduledRequest set after cancel is preserved', () => {
		// Simulates interrupt(): cancel() then schedule() sets a new request
		manager.setIsPrompting(true)
		manager.setCancelFn(() => {})
		manager.cancel()

		const newRequest = {
			source: 'other-agent' as const,
			agentMessages: ['draw'],
			userMessages: [],
			data: [],
			bounds: { x: 0, y: 0, w: 100, h: 100 },
			contextItems: [],
		}
		manager.setScheduledRequest(newRequest)

		// The scheduled request survives — prompt() continuation loop picks it up
		expect(manager.getScheduledRequest()).toEqual(newRequest)
		// isGenerating still true — _schedule stores request, doesn't call prompt()
		expect(manager.isGenerating()).toBe(true)
	})
})

import { describe, expect, test, mock } from 'bun:test'
import { AgentRequestManager } from './managers/AgentRequestManager'
import { TldrawAgent } from './TldrawAgent'

/**
 * Tests for TldrawAgent.request()'s active-request cleanup on early throw
 * (issue #50).
 *
 * `preparePrompt` (called inside `requestAgentActions`, before its internal
 * try block) can throw synchronously — e.g. if the mode is inactive. That
 * used to skip `clearActiveRequest()`, leaving a stale active request that
 * caused a spurious cancellation on the agent's next request.
 */
describe('TldrawAgent.request() error cleanup', () => {
	test('requestAgentActions throwing before returning a promise still clears the active request', async () => {
		const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
		const requests = new AgentRequestManager({ editor } as any)
		const fakeAgent = {
			editor,
			requests,
			cancel: mock(() => {}),
			requestAgentActions: mock(() => {
				throw new Error('preparePrompt failed: mode is not active')
			}),
		}

		await expect(TldrawAgent.prototype.request.call(fakeAgent, 'hello')).rejects.toThrow(
			'preparePrompt failed: mode is not active'
		)
		expect(fakeAgent.requests.getActiveRequest()).toBeNull()
	})

	test('the returned promise rejecting asynchronously still clears the active request', async () => {
		const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
		const requests = new AgentRequestManager({ editor } as any)
		const fakeAgent = {
			editor,
			requests,
			cancel: mock(() => {}),
			requestAgentActions: mock(() => ({
				promise: Promise.reject(new Error('stream failed mid-request')),
				cancel: () => {},
			})),
		}

		await expect(TldrawAgent.prototype.request.call(fakeAgent, 'hello')).rejects.toThrow(
			'stream failed mid-request'
		)
		expect(fakeAgent.requests.getActiveRequest()).toBeNull()
	})

	test('a successful request clears the active request as before', async () => {
		const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
		const requests = new AgentRequestManager({ editor } as any)
		const fakeAgent = {
			editor,
			requests,
			cancel: mock(() => {}),
			requestAgentActions: mock(() => ({ promise: Promise.resolve('done'), cancel: () => {} })),
		}

		const result = await TldrawAgent.prototype.request.call(fakeAgent, 'hello')
		expect(result).toBe('done')
		expect(fakeAgent.requests.getActiveRequest()).toBeNull()
	})
})

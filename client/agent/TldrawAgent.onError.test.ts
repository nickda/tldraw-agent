import { describe, expect, mock, test } from 'bun:test'
import { AgentRequestManager } from './managers/AgentRequestManager'
import { TldrawAgent } from './TldrawAgent'

/**
 * Issue #55, bug 2: when `this.request()` threw inside `prompt()`, the error
 * was only logged via console.error — the agent's `onError` callback (the
 * mechanism that surfaces a user-visible toast, wired in
 * TldrawAgentAppProvider) was never invoked, so a failed prompt looked to the
 * user like nothing happened at all.
 */

function createFakeAgent(overrides: { requestImpl?: () => Promise<void>; onError?: (e: any) => void }) {
	const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
	const requests = new AgentRequestManager({ editor } as any)

	const fakeAgent = {
		editor,
		requests,
		isActingOnEditor: false,
		chat: { push: mock(() => {}) },
		mode: {
			getCurrentModeNode: () => ({}),
			getCurrentModeType: () => 'idling',
			getCurrentModeDefinition: () => ({ type: 'idling', active: false }),
		},
		request: overrides.requestImpl ?? mock(async () => {}),
		onError: overrides.onError ?? mock(() => {}),
		prompt: TldrawAgent.prototype.prompt,
	}

	return fakeAgent
}

describe('TldrawAgent.prompt() routes a failed request() through onError', () => {
	test('a rejected request() call invokes onError with the error', async () => {
		const onError = mock(() => {})
		const fakeAgent = createFakeAgent({
			requestImpl: mock(async () => {
				throw new Error('model call failed')
			}),
			onError,
		})

		await TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')

		expect(onError).toHaveBeenCalledTimes(1)
		expect(onError.mock.calls[0][0]).toEqual(new Error('model call failed'))
	})

	test('a user-initiated cancellation does not invoke onError', async () => {
		const onError = mock(() => {})
		const fakeAgent = createFakeAgent({
			requestImpl: mock(async () => {
				throw 'Cancelled by user'
			}),
			onError,
		})

		await TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')

		expect(onError).not.toHaveBeenCalled()
	})

	test('an AbortError does not invoke onError', async () => {
		const onError = mock(() => {})
		const abortError = new Error('aborted')
		abortError.name = 'AbortError'
		const fakeAgent = createFakeAgent({
			requestImpl: mock(async () => {
				throw abortError
			}),
			onError,
		})

		await TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')

		expect(onError).not.toHaveBeenCalled()
	})

	test('a successful request() never invokes onError', async () => {
		const onError = mock(() => {})
		const fakeAgent = createFakeAgent({ onError })

		await TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')

		expect(onError).not.toHaveBeenCalled()
	})
})

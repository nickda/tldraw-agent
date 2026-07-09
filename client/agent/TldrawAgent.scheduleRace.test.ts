import { describe, expect, mock, test } from 'bun:test'
import { AgentRequestManager } from './managers/AgentRequestManager'
import { TldrawAgent } from './TldrawAgent'

/**
 * Issue #55, bug 4: while `prompt()` awaited `Promise.all(scheduledRequest.data)`
 * for a request it had already read via `getScheduledRequest()`, a concurrent
 * `schedule()` call would merge into that same request object, then have its
 * merge silently wiped when `prompt()` unconditionally cleared the scheduled
 * request afterwards. `prompt()` now clears the scheduled request *before*
 * awaiting its data, so a concurrent schedule() creates a fresh request
 * instead of merging into (and losing) the one already being processed.
 */

function createFakeAgent() {
	const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
	const requests = new AgentRequestManager({ editor } as any)

	const fakeAgent: any = {
		editor,
		requests,
		isActingOnEditor: false,
		chat: { push: mock(() => {}) },
		mode: {
			getCurrentModeNode: () => ({}),
			getCurrentModeType: () => 'idling',
			getCurrentModeDefinition: () => ({ type: 'idling', active: false }),
		},
		onError: mock(() => {}),
		prompt: TldrawAgent.prototype.prompt,
		schedule: TldrawAgent.prototype.schedule,
		_schedule: TldrawAgent.prototype['_schedule'],
	}
	return fakeAgent
}

describe('TldrawAgent.prompt() vs a concurrent schedule() call', () => {
	test('a schedule() call arriving while the previous scheduled request\'s data is being awaited is not silently dropped', async () => {
		let releaseData: (() => void) | null = null
		const pendingData = new Promise<string>((resolve) => {
			releaseData = () => resolve('first-data')
		})

		const fakeAgent = createFakeAgent()
		const requestCalls: any[] = []
		let requestCallCount = 0
		fakeAgent.request = mock(async (request: any) => {
			requestCallCount++
			requestCalls.push(request)
			// Only the initial prompt schedules a follow-up whose data is still
			// pending; later calls must not re-schedule, or the recursive prompt()
			// call in the code under test would loop forever.
			if (requestCallCount === 1) {
				fakeAgent.schedule.call(fakeAgent, { data: [pendingData] })
			}
		})

		const promptPromise = TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')

		// Let the microtask queue advance far enough that prompt() has read and
		// cleared the scheduled request and is now awaiting its (still-pending)
		// data — this is the window the race lived in.
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()

		// A concurrent schedule() call races in during that window.
		fakeAgent.schedule.call(fakeAgent, { agentMessages: ['concurrent follow-up'] })

		releaseData!()
		await promptPromise

		// The concurrent schedule() call's content must have actually reached
		// request() (processed as its own turn), not been merged into the
		// first scheduled request and then wiped when that request was cleared.
		const sawConcurrentMessage = requestCalls.some((r) =>
			r.agentMessages?.includes('concurrent follow-up')
		)
		expect(sawConcurrentMessage).toBe(true)
	})
})

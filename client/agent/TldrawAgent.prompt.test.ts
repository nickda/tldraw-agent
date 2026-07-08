import { describe, expect, test, mock } from 'bun:test'
import { AgentRequestManager } from './managers/AgentRequestManager'
import { TldrawAgent, MAX_MODE_TRANSITIONS_PER_PROMPT } from './TldrawAgent'

/**
 * Tests for TldrawAgent.prompt()'s error-cleanup guarantees (issue #50).
 *
 * Several steps between setIsPrompting(true) and setIsPrompting(false) can
 * throw: the mode-start hook, the post-completion mode-transition loop, the
 * inactive-mode guard, and the recursive continuation call. Any of these
 * throwing used to leave isGenerating() stuck true forever. We call the real
 * `prompt()` method via `.call()` against a minimal fake agent, since
 * TldrawAgent has deep Editor dependencies that are hard to construct in a
 * unit test (see TldrawAgent.schedule.test.ts).
 */

function createFakeAgent(overrides: {
	modeNode?: any
	modeType?: string
	modeActive?: boolean
	requestImpl?: () => Promise<void>
}) {
	const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
	const requests = new AgentRequestManager({ editor } as any)
	const modeType = overrides.modeType ?? 'idling'
	const modeNode = overrides.modeNode ?? {}
	const modeActive = overrides.modeActive ?? false

	const fakeAgent = {
		editor,
		requests,
		isActingOnEditor: false,
		chat: { push: mock(() => {}) },
		mode: {
			getCurrentModeNode: () => modeNode,
			getCurrentModeType: () => modeType,
			getCurrentModeDefinition: () => ({ type: modeType, active: modeActive }),
		},
		request: overrides.requestImpl ?? mock(async () => {}),
		prompt: TldrawAgent.prototype.prompt,
	}

	return fakeAgent
}

describe('TldrawAgent.prompt() error cleanup', () => {
	test('mode-start hook throwing still clears isPrompting', async () => {
		const fakeAgent = createFakeAgent({
			modeNode: {
				onPromptStart: () => {
					throw new Error('boom from onPromptStart')
				},
			},
		})

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			'boom from onPromptStart'
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
		expect(fakeAgent.requests.getCancelFn()).toBeNull()
	})

	test('inactive-mode guard throwing (active mode with no scheduled request) still clears isPrompting', async () => {
		const fakeAgent = createFakeAgent({
			modeNode: {},
			modeType: 'working',
			modeActive: true,
		})

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			'Agent is not allowed to become inactive during the active mode: working'
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})

	test('post-completion mode-transition hook throwing still clears isPrompting', async () => {
		const fakeAgent = createFakeAgent({
			modeNode: {
				onPromptEnd: () => {
					throw new Error('boom from onPromptEnd')
				},
			},
		})

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			'boom from onPromptEnd'
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})

	test('a normal prompt that completes with no scheduled request clears isPrompting', async () => {
		const fakeAgent = createFakeAgent({ modeNode: {}, modeType: 'idling', modeActive: false })

		await TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})

	test('a rejecting scheduled-request data promise still clears isPrompting', async () => {
		const fakeAgent = createFakeAgent({
			modeNode: {
				onPromptEnd(agent: any) {
					agent.requests.setScheduledRequest({
						source: 'self',
						agentMessages: [],
						userMessages: [],
						data: [Promise.reject(new Error('boom from scheduled data'))],
						bounds: { x: 0, y: 0, w: 100, h: 100 },
						contextItems: [],
					})
				},
			},
		})

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			'boom from scheduled data'
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})

	test('the recursive continuation call throwing still clears isPrompting', async () => {
		let promptStartCalls = 0
		const fakeAgent = createFakeAgent({
			modeNode: {
				onPromptStart() {
					promptStartCalls++
					// Throw only on the nested continuation's onPromptStart, not the first call.
					if (promptStartCalls > 1) {
						throw new Error('boom from nested onPromptStart')
					}
				},
				onPromptEnd(agent: any) {
					// Schedule a continuation only on the first (non-nested) call.
					if (promptStartCalls === 1) {
						agent.requests.setScheduledRequest({
							source: 'self',
							agentMessages: [],
							userMessages: [],
							data: [],
							bounds: { x: 0, y: 0, w: 100, h: 100 },
							contextItems: [],
						})
					}
				},
			},
		})

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			'boom from nested onPromptStart'
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})

	test('mode-transition loop bails out with a clear error after a bounded number of iterations', async () => {
		// Two modes whose onPromptEnd hooks flip into each other forever.
		let currentType = 'modeA'
		const modeA = {
			onPromptEnd: () => {
				currentType = 'modeB'
			},
		}
		const modeB = {
			onPromptEnd: () => {
				currentType = 'modeA'
			},
		}

		const editor = { getViewportPageBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }) }
		const requests = new AgentRequestManager({ editor } as any)
		const fakeAgent = {
			editor,
			requests,
			isActingOnEditor: false,
			chat: { push: mock(() => {}) },
			mode: {
				getCurrentModeNode: () => (currentType === 'modeA' ? modeA : modeB),
				getCurrentModeType: () => currentType,
				getCurrentModeDefinition: () => ({ type: currentType, active: false }),
			},
			request: mock(async () => {}),
		}

		await expect(TldrawAgent.prototype.prompt.call(fakeAgent, 'hello')).rejects.toThrow(
			`exceeded ${MAX_MODE_TRANSITIONS_PER_PROMPT} iterations`
		)
		expect(fakeAgent.requests.isGenerating()).toBe(false)
	})
})

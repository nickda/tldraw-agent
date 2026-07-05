import { DispatchExecutorsAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
import { executorVoiceInstruction } from '../agent/executorVoice'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const DispatchExecutorsActionUtil = registerActionUtil(
	class DispatchExecutorsActionUtil extends AgentActionUtil<DispatchExecutorsAction> {
		static override type = 'dispatchExecutors' as const

		override getInfo(action: Streaming<DispatchExecutorsAction>) {
			return {
				icon: 'cursor' as const,
				description: action.complete ? 'Dispatched the executors' : 'Dispatching the executors...',
			}
		}

		override applyAction(action: Streaming<DispatchExecutorsAction>, _helpers: AgentHelpers) {
			if (!action.complete) return

			const editor = this.editor

			// Dispatch executors outside the synchronous extractingChanges context.
			// Use queueMicrotask (fires before rendering) instead of setTimeout(0)
			// which can be starved by React reconciliation on large state updates.
			queueMicrotask(() => {
				const agents = AgentAppAgentsManager.getAgents(editor)
				const executors = agents.filter((a) => a.role === 'executor')

				if (executors.length === 0) {
					console.warn('[TeamMode] No executors found at dispatch time')
					return
				}

				for (const executor of executors) {
					try {
						executor.interrupt({
							input: {
								agentMessages: [
									'You are an Executor Bee. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.' +
										executorVoiceInstruction(executor.beeName),
								],
								source: 'other-agent',
							},
						})
					} catch (e) {
						console.error(`[TeamMode] Failed to dispatch executor ${executor.id}:`, e)
					}
				}
			})
		}
	},
	{ forModes: ['planning'] }
)

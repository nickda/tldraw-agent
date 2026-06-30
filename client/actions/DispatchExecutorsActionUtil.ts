import { DispatchExecutorsAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
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

			// Dispatch executors outside the synchronous extractingChanges context.
			// interrupt() starts async prompt() which needs to run after the current
			// sync frame completes.
			setTimeout(() => {
				const agents = AgentAppAgentsManager.getAgents(this.editor)
				const executors = agents.filter((a) => a.role === 'executor')

				for (const executor of executors) {
					executor.interrupt({
						input: {
							agentMessages: [
								'You are an Executor Fairy. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.',
							],
							source: 'other-agent',
						},
					})
				}
			}, 0)
		}
	},
	{ forModes: ['planning'] }
)

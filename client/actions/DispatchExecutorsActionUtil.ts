import { DispatchExecutorsAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * The Planner dispatches the Executors. Registered for `planning` mode only.
 * Behaviour is wired in a later slice.
 */
export const DispatchExecutorsActionUtil = registerActionUtil(
	class DispatchExecutorsActionUtil extends AgentActionUtil<DispatchExecutorsAction> {
		static override type = 'dispatchExecutors' as const

		override getInfo(action: Streaming<DispatchExecutorsAction>) {
			return {
				icon: 'cursor' as const,
				description: action.complete ? 'Dispatched the executors' : 'Dispatching the executors...',
			}
		}
	},
	{ forModes: ['planning'] }
)

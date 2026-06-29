import { WritePlanAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * The Planner writes the Shared Plan. Registered for `planning` mode only, so
 * Executors physically cannot emit it. Behaviour is wired in a later slice.
 */
export const WritePlanActionUtil = registerActionUtil(
	class WritePlanActionUtil extends AgentActionUtil<WritePlanAction> {
		static override type = 'writePlan' as const

		override getInfo(action: Streaming<WritePlanAction>) {
			return {
				icon: 'pencil' as const,
				description: action.complete ? 'Wrote the plan' : 'Writing the plan...',
			}
		}
	},
	{ forModes: ['planning'] }
)

import { ClaimItemAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * An Executor claims the next available Plan Item from the Shared Plan.
 * Registered for `executing` mode only, so the Planner physically cannot emit
 * it. Behaviour is wired in a later slice.
 */
export const ClaimItemActionUtil = registerActionUtil(
	class ClaimItemActionUtil extends AgentActionUtil<ClaimItemAction> {
		static override type = 'claimItem' as const

		override getInfo(action: Streaming<ClaimItemAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Claimed a plan item' : 'Claiming a plan item...',
			}
		}
	},
	{ forModes: ['executing'] }
)

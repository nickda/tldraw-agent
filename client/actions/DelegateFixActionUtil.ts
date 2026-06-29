import { DelegateFixAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * The Planner directs a specific Executor to fix a specific defect. Registered
 * for `planning` mode only. Behaviour is wired in a later slice.
 */
export const DelegateFixActionUtil = registerActionUtil(
	class DelegateFixActionUtil extends AgentActionUtil<DelegateFixAction> {
		static override type = 'delegateFix' as const

		override getInfo(action: Streaming<DelegateFixAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Delegated a fix' : 'Delegating a fix...',
			}
		}
	},
	{ forModes: ['planning'] }
)

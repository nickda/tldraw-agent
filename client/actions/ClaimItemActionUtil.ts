import { ClaimItemAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppPlanManager } from '../agent/managers/AgentAppPlanManager'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const ClaimItemActionUtil = registerActionUtil(
	class ClaimItemActionUtil extends AgentActionUtil<ClaimItemAction> {
		static override type = 'claimItem' as const

		override getInfo(action: Streaming<ClaimItemAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Claimed a plan item' : 'Claiming a plan item...',
			}
		}

		override applyAction(action: Streaming<ClaimItemAction>, _helpers: AgentHelpers) {
			if (!action.complete) return

			const claimed = AgentAppPlanManager.claim(this.editor, this.agent.id)
			if (!claimed) return

			if (claimed.bounds) {
				this.agent.schedule({
					bounds: claimed.bounds,
					agentMessages: [
						`Draw "${claimed.text}" inside region x=${claimed.bounds.x} y=${claimed.bounds.y} w=${claimed.bounds.w} h=${claimed.bounds.h}. Use many shapes with color and fills. No text labels.`,
					],
				})
			} else {
				this.agent.schedule({
					agentMessages: [
						`Draw "${claimed.text}". Use many shapes with color and fills. No text labels.`,
					],
				})
			}
		}
	},
	{ forModes: ['executing'] }
)

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
						`You are an Executor Fairy drawing inside a specific region of the canvas.

YOUR ASSIGNED REGION: x=${claimed.bounds.x}, y=${claimed.bounds.y}, width=${claimed.bounds.w}, height=${claimed.bounds.h}

WHAT TO DRAW: ${claimed.text}

IMPORTANT RULES:
1. ALL shapes you create MUST have x,y coordinates within your assigned region bounds.
2. Position shapes relative to the region: use x values between ${claimed.bounds.x} and ${claimed.bounds.x + claimed.bounds.w}, y values between ${claimed.bounds.y} and ${claimed.bounds.y + claimed.bounds.h}.
3. After creating shapes, use the review action to check your work looks correct.
4. Make the drawing look good and recognizable. Use appropriate colors and fills.
5. Do NOT add text labels naming what you drew. The drawing should speak for itself.
6. For organic or natural subjects (animals, plants, people, landscapes), prefer layered shapes, pen strokes, and curved overlapping forms to create texture. Avoid flat geometric primitives for living things.`,
					],
				})
			} else {
				this.agent.schedule({
					agentMessages: [
						`You are an Executor Fairy. Draw the following: ${claimed.text}

After creating shapes, use the review action to check your work looks correct. Make the drawing look good and recognizable. Use appropriate colors and fills. Do NOT add text labels naming what you drew. For organic or natural subjects, prefer layered shapes, pen strokes, and curved overlapping forms to create texture.`,
					],
				})
			}
		}
	},
	{ forModes: ['executing'] }
)

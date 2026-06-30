import { WritePlanAction } from '../../shared/schema/AgentActionSchemas'
import { TodoItem } from '../../shared/types/TodoItem'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppPlanManager } from '../agent/managers/AgentAppPlanManager'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const WritePlanActionUtil = registerActionUtil(
	class WritePlanActionUtil extends AgentActionUtil<WritePlanAction> {
		static override type = 'writePlan' as const

		override getInfo(action: Streaming<WritePlanAction>) {
			const count = action.items?.length ?? 0
			return {
				icon: 'pencil' as const,
				description: action.complete
					? `Wrote plan (${count} item${count !== 1 ? 's' : ''})`
					: 'Writing the plan...',
			}
		}

		override applyAction(action: Streaming<WritePlanAction>, _helpers: AgentHelpers) {
			if (!action.complete) return
			if (!action.items || action.items.length === 0) return

			const plan: TodoItem[] = action.items.map((item, i) => ({
				id: (i + 1) as TodoItem['id'],
				text: item.text,
				status: 'todo' as const,
				bounds: { x: item.x, y: item.y, w: item.w, h: item.h },
			}))

			AgentAppPlanManager.$plan.set(this.editor, plan)
		}
	},
	{ forModes: ['planning'] }
)

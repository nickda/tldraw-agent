import { DelegateFixAction } from '../../shared/schema/AgentActionSchemas'
import { TodoItem } from '../../shared/types/TodoItem'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
import { AgentAppPlanManager } from '../agent/managers/AgentAppPlanManager'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const DelegateFixActionUtil = registerActionUtil(
	class DelegateFixActionUtil extends AgentActionUtil<DelegateFixAction> {
		static override type = 'delegateFix' as const

		override getInfo(action: Streaming<DelegateFixAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Delegated a fix' : 'Delegating a fix...',
			}
		}

		override applyAction(action: Streaming<DelegateFixAction>, _helpers: AgentHelpers) {
			if (!action.complete) return

			const bounds = { x: action.x, y: action.y, w: action.w, h: action.h }

			const plan = AgentAppPlanManager.getPlan(this.editor)
			const nextId = (plan.length + 1) as TodoItem['id']
			const fixItem: TodoItem = {
				id: nextId,
				text: action.text,
				status: 'in-progress' as const,
				assignee: action.agentId,
				bounds,
			}

			AgentAppPlanManager.$plan.set(this.editor, [...plan, fixItem])

			const executor = AgentAppAgentsManager.getAgent(this.editor, action.agentId)
			if (executor) {
				executor.interrupt({
					input: {
						bounds,
						agentMessages: [
							`Fix requested by the Planner: ${action.text}. Work inside the region (${bounds.x}, ${bounds.y}, ${bounds.w}x${bounds.h}).`,
						],
						source: 'other-agent',
					},
				})
			}
		}
	},
	{ forModes: ['planning'] }
)

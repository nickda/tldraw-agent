import { Box } from 'tldraw'
import { DelegateFixAction } from '../../shared/schema/AgentActionSchemas'
import { TodoItem } from '../../shared/types/TodoItem'
import { Streaming } from '../../shared/types/Streaming'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
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

			const agents = AgentAppAgentsManager.getAgents(this.editor)
			const executors = agents.filter((a) => a.role === 'executor')

			// Prefer the specified executor, fall back to first idle one. The
			// Planner sometimes supplies a bee name instead of an agent id, so
			// this resolved executor (not action.agentId) is the source of
			// truth for the assignee stamped on the fix item below.
			let executor = executors.find((e) => e.id === action.agentId)
			if (!executor || executor.requests.isGenerating()) {
				executor = executors.find((e) => !e.requests.isGenerating()) ?? executors[0]
			}

			const plan = AgentAppPlanManager.getPlan(this.editor)
			const nextId = (plan.length + 1) as TodoItem['id']
			const fixItem: TodoItem = {
				id: nextId,
				text: action.text,
				status: 'in-progress' as const,
				assignee: executor?.id,
				bounds,
			}

			AgentAppPlanManager.$plan.set(this.editor, [...plan, fixItem])

			if (executor) {
				// List the real ids of the shapes inside the fix region so the
				// executor edits by ids that actually exist, rather than by
				// whatever id the Planner guessed at in `text`. This is what makes
				// a cross-agent fix (editing a shape another executor drew) land
				// instead of silently missing on a wrong id.
				const box = Box.From(bounds)
				const idsInRegion = this.editor
					.getCurrentPageShapes()
					.filter((shape) => {
						const shapeBounds = this.editor.getShapePageBounds(shape)
						return shapeBounds ? box.includes(shapeBounds) : false
					})
					.map((shape) => convertTldrawIdToSimpleId(shape.id))
				const idsLine =
					idsInRegion.length > 0
						? `\n\nThe real shape IDs in this region are: ${idsInRegion.join(', ')}. Edit these by ID; do not invent IDs.`
						: ''

				executor.interrupt({
					input: {
						bounds,
						agentMessages: [
							`CORRECTION from the Planner. You MUST fix this issue:

${action.text}

Use move actions to reposition existing shapes, delete to remove wrong shapes, or create to add missing ones. Look at the screenshot to identify which shapes need to change. Do NOT redraw everything, only fix what's wrong.${idsLine}`,
						],
						source: 'other-agent',
					},
				})
			}
		}
	},
	{ forModes: ['planning'] }
)

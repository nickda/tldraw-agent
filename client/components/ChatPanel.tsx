import { FormEventHandler, useCallback, useRef } from 'react'
import { useAgent, useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

export function ChatPanel() {
	const app = useTldrawAgentApp()
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			if (value === '') {
				const planner = app.team.getPlanner()
				if (planner) planner.cancel()
				for (const executor of app.team.getExecutors()) {
					executor.cancel()
				}
				return
			}

			inputRef.current.value = ''

			const planner = app.team.getPlanner()
			if (planner) {
				const hasExistingShapes = planner.editor.getCurrentPageShapes().length > 0

				const positioningRule = hasExistingShapes
					? `This is a MODIFICATION of an existing drawing. Position new items so they visually integrate with existing shapes (overlapping, touching, held by). Do NOT use disjoint regions — new elements should connect to what's already on canvas. Look at the screenshot to see where existing shapes are and place new items relative to them.`
					: `This is a fresh drawing. Place items in disjoint regions so they don't overlap. Use the viewport bounds as a guide for positioning.`

				planner.interrupt({
					input: {
						agentMessages: [
							`You are the Planner Fairy. Respond with: (1) a brief message action explaining your plan to the user, (2) a writePlan action decomposing the request into items, (3) a dispatchExecutors action.

Each writePlan item needs: text (description of what to draw), x, y, w, h (canvas region where it should be drawn).

${positioningRule}

User request: ${value}`,
						],
						userMessages: [value],
						bounds: planner.editor.getViewportPageBounds(),
						source: 'user',
						contextItems: agent.context.getItems(),
					},
				})
			}
		},
		[agent, app]
	)

	const handleNewChat = useCallback(() => {
		app.plan.reset()
		for (const a of app.agents.getAgents()) {
			a.reset()
		}
	}, [app])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<button className="new-chat-button" onClick={handleNewChat}>
					+
				</button>
			</div>
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ChatInput handleSubmit={handleSubmit} inputRef={inputRef} />
			</div>
		</div>
	)
}

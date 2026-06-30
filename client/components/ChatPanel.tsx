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
				planner.interrupt({
					input: {
						agentMessages: [
							`IMPORTANT: You MUST respond with a writePlan action followed by a dispatchExecutors action. Do NOT use message or think actions. You are the Planner Fairy whose ONLY job is to decompose user requests into plan items.

Each writePlan item needs: text (description of what to draw), x, y, w, h (canvas region where it should be drawn). Place items in disjoint regions so they don't overlap. Use the viewport bounds as a guide for positioning.

After the writePlan action, emit a dispatchExecutors action to start the Executor Fairies.

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

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
							`You are the Planner Fairy. Decompose this user request into a Shared Plan using the writePlan action. Each plan item must have: text (what to draw), and disjoint bounds (x, y, w, h) so Executors draw in separate regions. After writing the plan, use dispatchExecutors to start the Executors.\n\nUser request: ${value}`,
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

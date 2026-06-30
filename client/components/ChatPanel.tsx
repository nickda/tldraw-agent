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

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// Clear the chat input (context is cleared after it's captured in requestAgentActions)
			inputRef.current.value = ''

			// Route through Team Mode if active
			if (app.teamModeEnabled) {
				const planner = app.team.getPlanner()
				if (planner) {
					planner.interrupt({
						input: {
							agentMessages: [value],
							bounds: planner.editor.getViewportPageBounds(),
							source: 'user',
							contextItems: agent.context.getItems(),
						},
					})
				}
				return
			}

			// Sending a new message to the agent should interrupt the current request
			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent, app]
	)

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	const handleToggleTeamMode = useCallback(() => {
		if (app.teamModeEnabled) {
			app.team.reset()
		} else {
			app.team.activate()
		}
	}, [app])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<button className="new-chat-button" onClick={handleNewChat}>
					+
				</button>
				<button
					className={`team-mode-button${app.teamModeEnabled ? ' team-mode-button--active' : ''}`}
					onClick={handleToggleTeamMode}
					title={app.teamModeEnabled ? 'Disable Team Mode' : 'Enable Team Mode'}
				>
					Team
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

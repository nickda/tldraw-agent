import { FormEventHandler, useCallback, useRef, useState } from 'react'
import { useAgent, useAgents, useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
import { BeeDialogueFeed } from './BeeDialogueFeed'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { useBeeDialogue } from '../hooks/useBeeDialogue'

type ChatPanelTab = 'dialogue' | 'log'

export function ChatPanel() {
	const app = useTldrawAgentApp()
	const agent = useAgent()
	const agents = useAgents()
	const dialogueLines = useBeeDialogue(agents)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [tab, setTab] = useState<ChatPanelTab>('dialogue')

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

			// Start each user prompt from a clean Shared Plan and review counter.
			// Both persist on the editor, so without this the previous prompt's
			// completed plan items and its maxed-out review round carry over: the
			// next request starts already at MAX_REVIEW_ROUNDS and reasons over a
			// stale done plan, which stalls and slows the run. The canvas shapes are
			// untouched, so a follow-up like "improve it" still builds on the drawing.
			app.plan.reset()

			const planner = app.team.getPlanner()
			if (planner) {
				const hasExistingShapes = planner.editor.getCurrentPageShapes().length > 0
				const executors = app.team.getExecutors()
				const executorNames = executors.map((e) => e.beeName).join(' and ')

				const positioningRule = hasExistingShapes
					? `This is a MODIFICATION of an existing drawing. Position new items so they visually integrate with existing shapes (overlapping, touching, held by). Do NOT use disjoint regions, new elements should connect to what's already on canvas. Look at the screenshot to see where existing shapes are and place new items relative to them.`
					: `This is a fresh drawing. Place items in disjoint regions so they don't overlap. Use the viewport bounds as a guide for positioning.`

				planner.interrupt({
					input: {
						agentMessages: [
							`You are Beeyonce, the Queen Bee planner. Workers: ${executorNames}. Voice: dry wit, deadpan, child-friendly. No puns. Never use em dashes; use commas or periods instead.

If you narrate MacBee's work, give MacBee a Scottish-inflected, provocative turn of phrase. If WannaBee appears to be pausing or slow to finish her claimed item, react with mild exasperation/grumbling about her slacking, in your own dry voice. Do not invent new mechanics, just narrate it.

You MUST emit these actions in this EXACT order:
1. message (MAX 2 sentences: what you'll draw + who does what)
2. writePlan (the actual plan items with coordinates)
3. dispatchExecutors

Do not use the think action for this. Go straight to message, then writePlan, then dispatchExecutors. Reasoning through the plan out loud in a think action burns your turn and can leave writePlan and dispatchExecutors unsent.

The message action MUST be short. Put ALL detail into writePlan items, not the message.

Each writePlan item needs: text (what to draw), x, y, w, h (canvas region).

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

	const handleClearAll = useCallback(() => {
		if (!window.confirm('Clear everything? This deletes the chat history and all shapes on the canvas.')) {
			return
		}
		// Wipe the canvas. Agent-drawn shapes are often locked, and
		// deleteShapes skips locked shapes by default, so delete inside a run
		// with ignoreShapeLock (the same escape hatch the agent itself uses).
		const editor = app.editor
		const shapeIds = editor.getCurrentPageShapeIds()
		if (shapeIds.size > 0) {
			editor.run(() => editor.deleteShapes(Array.from(shapeIds)), { ignoreShapeLock: true })
		}
		// Reset the shared plan and every agent's chat/state.
		app.plan.reset()
		for (const a of app.agents.getAgents()) {
			a.reset()
		}
	}, [app])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<div className="chat-header__tabs">
					<button
						className={`chat-header__tab${tab === 'dialogue' ? ' chat-header__tab--active' : ''}`}
						onClick={() => setTab('dialogue')}
					>
						Dialogue
					</button>
					<button
						className={`chat-header__tab${tab === 'log' ? ' chat-header__tab--active' : ''}`}
						onClick={() => setTab('log')}
					>
						Log
					</button>
				</div>
				<div className="chat-header__actions">
					<button
						className="clear-all-button"
						onClick={handleClearAll}
						title="Clear chat history and canvas"
					>
						Clear
					</button>
					<button className="new-chat-button" onClick={handleNewChat} title="New chat">
						+
					</button>
				</div>
			</div>
			{tab === 'dialogue' ? <BeeDialogueFeed lines={dialogueLines} /> : <ChatHistory agent={agent} />}
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ChatInput handleSubmit={handleSubmit} inputRef={inputRef} />
			</div>
		</div>
	)
}

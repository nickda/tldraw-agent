import { useValue } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'

/**
 * The most recent completed `message` action text from an agent's chat
 * history, or null if the agent hasn't spoken. Reactive: updates as the
 * agent pushes new chat items.
 *
 * Used to show a transient speech bubble over an Executor's sprite, since the
 * ChatPanel only renders the focused (Planner) agent's chat and would
 * otherwise hide everything MacBee and WannaBee say.
 */
export function useLatestBeeMessage(agent: TldrawAgent): { text: string; index: number } | null {
	return useValue(
		'latestBeeMessage',
		() => {
			const history = agent.chat.getHistory()
			for (let i = history.length - 1; i >= 0; i--) {
				const item = history[i]
				if (
					item.type === 'action' &&
					item.action._type === 'message' &&
					item.action.complete &&
					typeof item.action.text === 'string' &&
					item.action.text.trim().length > 0
				) {
					return { text: item.action.text, index: i }
				}
			}
			return null
		},
		[agent]
	)
}

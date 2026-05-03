import { useValue } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'

export function useFairyPosition(agent: TldrawAgent) {
	return useValue('fairyPosition', () => agent.requests.getFairyPosition(), [agent])
}

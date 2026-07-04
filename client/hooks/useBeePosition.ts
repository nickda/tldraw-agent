import { useValue } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'

export function useBeePosition(agent: TldrawAgent) {
	return useValue('beePosition', () => agent.requests.getBeePosition(), [agent])
}

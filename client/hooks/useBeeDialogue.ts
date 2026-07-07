import { useRef } from 'react'
import { useValue } from 'tldraw'
import { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import { TldrawAgent } from '../agent/TldrawAgent'

export interface BeeDialogueLine {
	key: string
	agentId: string
	beeName: string
	beeColor: string
	text: string
	timestamp: number
}

/**
 * A read-only snapshot of one agent's identity and chat history, decoupled
 * from the live `TldrawAgent` class so the aggregation logic can be unit
 * tested without a real agent/editor instance.
 */
export interface AgentSnapshot {
	agentId: string
	beeName: string
	beeColor: string
	history: ChatHistoryItem[]
}

/**
 * Pure aggregation: extracts complete `message` actions from each agent's
 * history snapshot, stamps each with a wall-clock timestamp on first
 * observation (cached by `${agentId}:${historyIndex}` in `cache`, mutated in
 * place), detects per-agent resets via `lastLengths` (also mutated in place),
 * and returns all lines merged and sorted by timestamp ascending.
 *
 * `action.time` on a `ChatHistoryActionItem` is elapsed duration since that
 * specific action started streaming (see worker/do/AgentService.ts), not a
 * shared wall clock, it cannot be used to order messages across agents. This
 * function assigns its own comparable clock value instead.
 *
 * `clock` is injected (defaults to `Date.now`) so tests can control time
 * deterministically.
 */
export function aggregateBeeDialogue(
	snapshots: AgentSnapshot[],
	cache: Map<string, number>,
	lastLengths: Map<string, number>,
	clock: () => number = Date.now
): BeeDialogueLine[] {
	const lines: BeeDialogueLine[] = []

	for (const snapshot of snapshots) {
		const previousLength = lastLengths.get(snapshot.agentId)
		if (previousLength !== undefined && snapshot.history.length < previousLength) {
			// This agent's history shrank: it was reset. Drop only this
			// agent's cached stamps so a new message reusing a low index
			// doesn't inherit a stale timestamp.
			const prefix = `${snapshot.agentId}:`
			for (const key of Array.from(cache.keys())) {
				if (key.startsWith(prefix)) {
					cache.delete(key)
				}
			}
		}
		lastLengths.set(snapshot.agentId, snapshot.history.length)

		for (let i = 0; i < snapshot.history.length; i++) {
			const item = snapshot.history[i]
			if (
				item.type !== 'action' ||
				item.action._type !== 'message' ||
				!item.action.complete ||
				typeof item.action.text !== 'string' ||
				item.action.text.trim().length === 0
			) {
				continue
			}

			const key = `${snapshot.agentId}:${i}`
			let timestamp = cache.get(key)
			if (timestamp === undefined) {
				timestamp = clock()
				cache.set(key, timestamp)
			}

			lines.push({
				key,
				agentId: snapshot.agentId,
				beeName: snapshot.beeName,
				beeColor: snapshot.beeColor,
				text: item.action.text,
				timestamp,
			})
		}
	}

	lines.sort((a, b) => a.timestamp - b.timestamp)
	return lines
}

/**
 * Reactive wrapper: reads every agent's live chat history via `useValue`,
 * builds snapshots, and runs them through `aggregateBeeDialogue`. The stamp
 * cache and reset-detection map live in refs so they persist across renders
 * without triggering re-renders themselves.
 */
export function useBeeDialogue(agents: TldrawAgent[]): BeeDialogueLine[] {
	const cacheRef = useRef<Map<string, number>>(new Map())
	const lastLengthsRef = useRef<Map<string, number>>(new Map())

	const historiesKey = agents.map((a) => a.id).join(',')
	const histories = useValue(
		'beeDialogueHistories',
		() => agents.map((a) => a.chat.getHistory()),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[historiesKey]
	)

	const snapshots: AgentSnapshot[] = agents.map((agent, i) => ({
		agentId: agent.id,
		beeName: agent.beeName,
		beeColor: agent.beeColor,
		history: histories[i] ?? [],
	}))

	return aggregateBeeDialogue(snapshots, cacheRef.current, lastLengthsRef.current)
}

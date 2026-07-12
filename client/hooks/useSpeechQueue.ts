/**
 * Global speech queue: only one bee speech bubble shows at a time.
 * Each bee registers speech requests; the queue serializes display
 * so bubbles never overlap.
 */

type SpeechEntry = {
	agentId: string
	text: string
	timestamp: number
}

type Listener = (activeAgentId: string | null, text: string | null) => void

const DISPLAY_DURATION_MS = 5000
const GAP_MS = 400

let queue: SpeechEntry[] = []
let activeEntry: SpeechEntry | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let listeners: Set<Listener> = new Set()

function notify() {
	const id = activeEntry?.agentId ?? null
	const text = activeEntry?.text ?? null
	for (const listener of listeners) {
		listener(id, text)
	}
}

function processNext() {
	if (queue.length === 0) {
		activeEntry = null
		notify()
		return
	}

	activeEntry = queue.shift()!
	notify()

	timer = setTimeout(() => {
		timer = null
		setTimeout(processNext, GAP_MS)
	}, DISPLAY_DURATION_MS)
}

export function enqueueSpeech(agentId: string, text: string) {
	const entry: SpeechEntry = { agentId, text, timestamp: Date.now() }

	const existingIdx = queue.findIndex((e) => e.agentId === agentId)
	if (existingIdx !== -1) {
		queue[existingIdx] = entry
	} else {
		queue.push(entry)
	}

	if (!activeEntry && !timer) {
		processNext()
	}
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener)
	listener(activeEntry?.agentId ?? null, activeEntry?.text ?? null)
	return () => {
		listeners.delete(listener)
	}
}

export function clearQueue() {
	queue = []
	activeEntry = null
	if (timer) {
		clearTimeout(timer)
		timer = null
	}
	notify()
}

# Bee Dialogue Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a merged, chronologically-sorted, larger-font transcript of what each bee says, with per-bee attribution, as the new default view in `ChatPanel`, with a tab switch back to the existing action-log view.

**Architecture:** A new client-side aggregation hook (`useBeeDialogue`) reads every agent's existing `chat.getHistory()` reactively, filters to complete `message` actions, stamps each with a client-observed wall-clock timestamp (since the existing `action.time` field is per-action elapsed duration, not comparable across agents), and merges/sorts across agents. A new presentational component (`BeeDialogueFeed`) renders the result. `ChatPanel` gets a local tab state toggling between the new component and the existing `ChatHistory`.

**Tech Stack:** React + TypeScript, tldraw SDK (`useValue`), Vite, `bun test`.

## Global Constraints

- Only `message`-type, `complete: true` actions count as dialogue lines. No other action types render in the new view.
- `action.time` is per-action elapsed duration since that action started streaming (see `worker/do/AgentService.ts`), not a wall clock. It must never be used to sort across agents.
- The existing `ChatHistory` (Log tab) is unchanged: same component, same props, same planner-only scope.
- The existing speech-bubble behavior (`BeeAvatarOverlay.tsx`, `useLatestBeeMessage`) is unchanged, both read from the same chat history independently.
- No changes to `AgentChatManager`, `ChatHistoryItem`, or the action schema.
- Test runner: `bun test <path>`. Type check: `bunx tsc --noEmit -p tsconfig.json`.

---

### Task 1: `useBeeDialogue` hook — timestamp stamping and reset detection

**Files:**
- Create: `client/hooks/useBeeDialogue.ts`
- Create: `client/hooks/useBeeDialogue.test.ts`

**Interfaces:**
- Consumes: `TldrawAgent` (`.id`, `.beeName`, `.beeColor`, `.chat.getHistory()`), `ChatHistoryActionItem` shape from `shared/types/ChatHistoryItem.ts` (`{ type: 'action', action: Streaming<AgentAction> }` where a message action has `_type: 'message'`, `text: string`, `complete: boolean`).
- Produces: `export interface BeeDialogueLine { key: string; agentId: string; beeName: string; beeColor: string; text: string; timestamp: number }` and `export function useBeeDialogue(agents: TldrawAgent[]): BeeDialogueLine[]`.

This task builds the hook's core logic as a **pure, testable function** separated from the `useValue`/React-reactivity wrapper, so the stamping and reset-detection rules can be unit tested without mocking React or tldraw atoms.

- [ ] **Step 1: Write the failing tests for the pure aggregation function**

```ts
// client/hooks/useBeeDialogue.test.ts
import { describe, expect, test } from 'bun:test'
import { aggregateBeeDialogue, type AgentSnapshot } from './useBeeDialogue'

function snapshot(
	agentId: string,
	beeName: string,
	beeColor: string,
	messages: Array<{ text: string; complete: boolean } | null>
): AgentSnapshot {
	return {
		agentId,
		beeName,
		beeColor,
		history: messages.map((m) =>
			m === null
				? { type: 'prompt', promptSource: 'user', agentFacingMessage: '', userFacingMessage: null, contextItems: [], selectedShapes: [] }
				: {
						type: 'action',
						action: { _type: 'message', text: m.text, complete: m.complete, time: 0 },
						diff: { added: {}, updated: {}, removed: {} },
						acceptance: 'accepted',
					}
		),
	}
}

describe('aggregateBeeDialogue', () => {
	test('extracts only complete message actions', () => {
		const snapshots = [
			snapshot('a1', 'Beeyonce', '#6366f1', [
				{ text: 'Drawing a house.', complete: true },
				{ text: 'still typing', complete: false },
				null,
			]),
		]
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		const clock = { now: 1000 }
		const lines = aggregateBeeDialogue(snapshots, cache, lastLengths, () => clock.now)

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			key: 'a1:0',
			agentId: 'a1',
			beeName: 'Beeyonce',
			beeColor: '#6366f1',
			text: 'Drawing a house.',
			timestamp: 1000,
		})
	})

	test('stamps each message once, reusing the cached timestamp on later calls', () => {
		const snapshots = [snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'hello', complete: true }])]
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const first = aggregateBeeDialogue(snapshots, cache, lastLengths, () => now)
		now = 5000
		const second = aggregateBeeDialogue(snapshots, cache, lastLengths, () => now)

		expect(first[0].timestamp).toBe(1000)
		expect(second[0].timestamp).toBe(1000)
	})

	test('merges and sorts messages from multiple agents by timestamp', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		// Beeyonce speaks first.
		let lines = aggregateBeeDialogue(
			[snapshot('planner', 'Beeyonce', '#6366f1', [{ text: 'first', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)
		expect(lines.map((l) => l.text)).toEqual(['first'])

		// Now MacBee speaks later, and both snapshots are present.
		now = 2000
		lines = aggregateBeeDialogue(
			[
				snapshot('planner', 'Beeyonce', '#6366f1', [{ text: 'first', complete: true }]),
				snapshot('exec0', 'MacBee', '#f59e0b', [{ text: 'second', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(lines.map((l) => l.text)).toEqual(['first', 'second'])
		expect(lines.map((l) => l.timestamp)).toEqual([1000, 2000])
	})

	test('invalidates a single agent cache when its history shrinks (reset)', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		aggregateBeeDialogue(
			[snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'old message', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.has('a1:0')).toBe(true)

		// Agent a1 is reset: history is now empty, then a new message lands at index 0.
		now = 9000
		aggregateBeeDialogue([snapshot('a1', 'Beeyonce', '#6366f1', [])], cache, lastLengths, clockFn)
		const lines = aggregateBeeDialogue(
			[snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'new message', complete: true }])],
			cache,
			lastLengths,
			clockFn
		)

		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ text: 'new message', timestamp: 9000 })
	})

	test('does not cross-contaminate cache invalidation between agents', () => {
		const cache = new Map<string, number>()
		const lastLengths = new Map<string, number>()
		let now = 1000
		const clockFn = () => now

		aggregateBeeDialogue(
			[
				snapshot('a1', 'Beeyonce', '#6366f1', [{ text: 'a1 msg', complete: true }]),
				snapshot('a2', 'MacBee', '#f59e0b', [{ text: 'a2 msg', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.get('a1:0')).toBe(1000)
		expect(cache.get('a2:0')).toBe(1000)

		// Only a1 resets. a2's cached stamp must survive untouched.
		now = 5000
		aggregateBeeDialogue(
			[
				snapshot('a1', 'Beeyonce', '#6366f1', []),
				snapshot('a2', 'MacBee', '#f59e0b', [{ text: 'a2 msg', complete: true }]),
			],
			cache,
			lastLengths,
			clockFn
		)
		expect(cache.get('a2:0')).toBe(1000)
	})

	test('empty agent list produces an empty result', () => {
		expect(aggregateBeeDialogue([], new Map(), new Map(), () => 1)).toEqual([])
	})
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test client/hooks/useBeeDialogue.test.ts`
Expected: FAIL. `useBeeDialogue.ts` does not exist yet, so the import throws.

- [ ] **Step 3: Write the implementation**

```ts
// client/hooks/useBeeDialogue.ts
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
```

Note: `useValue`'s dependency array is keyed on `historiesKey` (a stable string derived from agent ids) rather than the `agents` array reference itself, because `useAgents()` (consumed by the caller in Task 2) returns a new array reference on every render even when the underlying agents are unchanged, and `useValue`'s tracked-value function itself always re-reads `agents.map(...)` fresh, so this only controls how often the value function re-runs relative to reactive invalidation, not correctness. If this causes lint friction, the `eslint-disable` comment is intentional and documented here, do not remove it as part of a lint cleanup.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test client/hooks/useBeeDialogue.test.ts`
Expected: `6 pass`, `0 fail`.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `useBeeDialogue.ts` or its test.

- [ ] **Step 6: Commit**

```bash
git add client/hooks/useBeeDialogue.ts client/hooks/useBeeDialogue.test.ts
git commit -m "feat: add useBeeDialogue hook for cross-agent message aggregation"
```

---

### Task 2: `BeeDialogueFeed` component

**Files:**
- Create: `client/components/BeeDialogueFeed.tsx`
- Create: `client/components/BeeDialogueFeed.test.tsx`

**Interfaces:**
- Consumes: `useBeeDialogue` (Task 1, `../hooks/useBeeDialogue`), `useAgents` from `../agent/TldrawAgentAppProvider`, `BeeDialogueLine` type (Task 1).
- Produces: `export function BeeDialogueFeed(): JSX.Element`. No props, it is self-contained (reads agents via `useAgents()` internally), matching the composability of the existing `<ChatHistory agent={agent} />` usage site being replaced in Task 3.

- [ ] **Step 1: Write the test file**

```tsx
// client/components/BeeDialogueFeed.test.tsx
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BeeDialogueLine } from '../hooks/useBeeDialogue'
import { renderBeeDialogueLine } from './BeeDialogueFeed'

function line(overrides: Partial<BeeDialogueLine> = {}): BeeDialogueLine {
	return {
		key: 'a1:0',
		agentId: 'a1',
		beeName: 'Beeyonce',
		beeColor: '#6366f1',
		text: 'Drawing a house.',
		timestamp: 1000,
		...overrides,
	}
}

describe('renderBeeDialogueLine', () => {
	test('renders the bee name and message text', () => {
		const markup = renderToStaticMarkup(<>{renderBeeDialogueLine(line())}</>)
		expect(markup).toContain('Beeyonce')
		expect(markup).toContain('Drawing a house.')
	})

	test('applies the beeColor to the attribution dot', () => {
		const markup = renderToStaticMarkup(
			<>{renderBeeDialogueLine(line({ beeColor: '#f59e0b', beeName: 'MacBee' }))}</>
		)
		expect(markup).toContain('#f59e0b')
		expect(markup).toContain('MacBee')
	})

	test('uses the line key as a stable identity', () => {
		const el = renderBeeDialogueLine(line({ key: 'exec0:3' }))
		expect(el.key).toBe('exec0:3')
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test client/components/BeeDialogueFeed.test.tsx`
Expected: FAIL, `BeeDialogueFeed.tsx` does not exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// client/components/BeeDialogueFeed.tsx
import { useEffect, useRef } from 'react'
import { BeeDialogueLine, useBeeDialogue } from '../hooks/useBeeDialogue'
import { useAgents } from '../agent/TldrawAgentAppProvider'

/**
 * Renders one dialogue line: a colored attribution dot + bee name header,
 * then the message text below it. Exported standalone (not inlined in the
 * `.map()` call) so it can be unit tested without mounting the full
 * scrolling feed.
 */
export function renderBeeDialogueLine(line: BeeDialogueLine) {
	return (
		<div className="bee-dialogue-line" key={line.key}>
			<div className="bee-dialogue-line__attribution">
				<span
					className="bee-dialogue-line__dot"
					style={{ backgroundColor: line.beeColor }}
				/>
				<span className="bee-dialogue-line__name" style={{ color: line.beeColor }}>
					{line.beeName}
				</span>
			</div>
			<div className="bee-dialogue-line__text">{line.text}</div>
		</div>
	)
}

export function BeeDialogueFeed() {
	const agents = useAgents()
	const lines = useBeeDialogue(agents)
	const feedRef = useRef<HTMLDivElement>(null)
	const previousScrollDistanceFromBottomRef = useRef(0)

	useEffect(() => {
		if (!feedRef.current) return
		if (previousScrollDistanceFromBottomRef.current <= 0) {
			feedRef.current.scrollTo(0, feedRef.current.scrollHeight)
		}
	}, [lines])

	const handleScroll = () => {
		if (!feedRef.current) return
		const scrollDistanceFromBottom =
			feedRef.current.scrollHeight - feedRef.current.scrollTop - feedRef.current.clientHeight
		previousScrollDistanceFromBottomRef.current = scrollDistanceFromBottom
	}

	return (
		<div className="bee-dialogue-feed" ref={feedRef} onScroll={handleScroll}>
			{lines.map(renderBeeDialogueLine)}
		</div>
	)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test client/components/BeeDialogueFeed.test.tsx`
Expected: `3 pass`, `0 fail`.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `BeeDialogueFeed.tsx` or its test.

- [ ] **Step 6: Commit**

```bash
git add client/components/BeeDialogueFeed.tsx client/components/BeeDialogueFeed.test.tsx
git commit -m "feat: add BeeDialogueFeed component"
```

---

### Task 3: Tab switch in `ChatPanel`

**Files:**
- Modify: `client/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: `BeeDialogueFeed` (Task 2, `./BeeDialogueFeed`).
- No new exports, `ChatPanel`'s own exported signature is unchanged.

- [ ] **Step 1: Add the import and local tab state**

Change:
```tsx
import { FormEventHandler, useCallback, useRef } from 'react'
import { useAgent, useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

export function ChatPanel() {
	const app = useTldrawAgentApp()
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
```
to:
```tsx
import { FormEventHandler, useCallback, useRef, useState } from 'react'
import { useAgent, useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
import { BeeDialogueFeed } from './BeeDialogueFeed'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

type ChatPanelTab = 'dialogue' | 'log'

export function ChatPanel() {
	const app = useTldrawAgentApp()
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [tab, setTab] = useState<ChatPanelTab>('dialogue')
```

- [ ] **Step 2: Add the tab buttons to the header and swap the rendered view**

Change:
```tsx
	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
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
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
```
to:
```tsx
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
			{tab === 'dialogue' ? <BeeDialogueFeed /> : <ChatHistory agent={agent} />}
			<div className="chat-input-container">
```

Note: the header's inner buttons are now grouped into `.chat-header__tabs` (left) and
`.chat-header__actions` (right) wrapper `div`s, this is required for Task 4's CSS
change from `justify-content: flex-end` to `justify-content: space-between` to
correctly push the two groups to opposite ends, rather than space-between-ing four
loose buttons.

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `ChatPanel.tsx`.

- [ ] **Step 4: Commit**

```bash
git add client/components/ChatPanel.tsx
git commit -m "feat: add Dialogue/Log tab switch to ChatPanel"
```

---

### Task 4: CSS for the tab switch and dialogue feed

**Files:**
- Modify: `client/index.css`

**Interfaces:** none (pure styling, no exports).

- [ ] **Step 1: Update `.chat-header` and add the tab-group styles**

Change:
```css
.chat-header {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 4px;
}
```
to:
```css
.chat-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 4px;
	padding: 0 4px;
}

.chat-header__tabs {
	display: flex;
	gap: 2px;
}

.chat-header__actions {
	display: flex;
	align-items: center;
	gap: 4px;
}

.chat-header__tab {
	height: 32px;
	padding: 0 12px;
	font-size: 13px;
	font-weight: 500;
	appearance: none;
	border: 0;
	border-radius: 4px;
	cursor: pointer;
	background: none;
	color: var(--tl-color-text-2);
}

.chat-header__tab:hover {
	background-color: var(--tl-color-muted-2);
	color: var(--tl-color-text);
}

.chat-header__tab--active {
	background-color: var(--tl-color-muted-1);
	color: var(--tl-color-text);
}
```

- [ ] **Step 2: Add the dialogue feed and dialogue line styles**

Add after the `.chat-header__tab--active` block (or anywhere in the "Chat Panel" CSS section, adjacent to `.chat-history`):

```css
.bee-dialogue-feed {
	padding: 0px 16px 32px 16px;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 16px;
	height: 100%;
	position: relative;
	width: 100%;
	scrollbar-width: 8px;
	scrollbar-color: var(--tl-color-muted-1) transparent;
}

.bee-dialogue-feed::-webkit-scrollbar {
	width: 8px;
}

.bee-dialogue-feed::-webkit-scrollbar-track {
	background: transparent;
}

.bee-dialogue-feed::-webkit-scrollbar-thumb {
	background: var(--tl-color-muted-1);
	border-radius: 4px;
}

.bee-dialogue-line {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.bee-dialogue-line__attribution {
	display: flex;
	align-items: center;
	gap: 6px;
}

.bee-dialogue-line__dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.bee-dialogue-line__name {
	font-size: 13px;
	font-weight: 600;
}

.bee-dialogue-line__text {
	font-size: 16px;
	line-height: 1.4;
	color: var(--tl-color-text-1);
}
```

- [ ] **Step 3: Verify no CSS syntax errors**

Run: `bun run build`
Expected: build succeeds (Vite processes `index.css` as part of the client build, a
malformed rule would surface as a PostCSS/esbuild error here).

- [ ] **Step 4: Commit**

```bash
git add client/index.css
git commit -m "feat: style Dialogue/Log tabs and bee dialogue feed"
```

---

### Task 5: Full-repo verification pass

**Files:** none modified, verification only.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all tests pass, including the 9 new tests from Tasks 1-2 (6 in
`useBeeDialogue.test.ts`, 3 in `BeeDialogueFeed.test.tsx`). The one pre-existing
`sharedPlan.test.ts` failure (confirmed present on `main` before this branch, unrelated
to this feature) is expected and not a regression, do not attempt to fix it as part
of this plan.

- [ ] **Step 2: Type-check the whole project**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors beyond the pre-existing repo-wide `bun:test` module-resolution
gap and any other baseline noise already present on `main`.

- [ ] **Step 3: Production build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke check reminder (not automatable in this plan)**

Run `AWS_REGION=us-west-2 bash scripts/dev-bedrock.sh` (or the local-model equivalent),
open the app, and confirm: the Dialogue tab is selected by default and shows an empty
feed on a fresh chat, submitting a prompt causes the planner's message to appear with
a colored attribution dot and 16px text, executor messages (MacBee/WannaBee) appear in
the same feed once they speak (not just as transient speech bubbles), messages from
different bees interleave in the order they were actually said, switching to the Log
tab shows the original planner-only action log unchanged, switching back to Dialogue
preserves the accumulated transcript, and clicking Clear or + empties the Dialogue feed.
No test in this plan renders the live multi-agent flow end to end, this manual check is
the only verification of the real cross-agent ordering and reset-detection behavior
under a live Team Mode session.

- [ ] **Step 5: No commit for this task** (verification only, nothing to stage).

---

## Self-Review

**Spec coverage:**
- Tab switch (Dialogue default, Log = unchanged old view) — Task 3. ✅
- Messages-only filtering — Task 1 (`aggregateBeeDialogue`'s complete-message filter). ✅
- Cross-agent wall-clock stamping (not `action.time`) — Task 1, explicitly tested. ✅
- Per-agent reset detection via history-length shrink — Task 1, explicitly tested
  (including the cross-contamination test, which is the sharpest edge case in the spec). ✅
- Merged chronological sort — Task 1, tested. ✅
- Attribution (dot + name, `beeColor`) — Task 2. ✅
- 16px message text — Task 4. ✅
- Auto-scroll-unless-scrolled-up, reusing the existing `ChatHistory` pattern — Task 2. ✅
- Fixed-height, internally-scrolling container — Task 4 (`.bee-dialogue-feed` mirrors
  `.chat-history`'s `height: 100%; overflow-y: auto`). ✅
- Role-agnostic (works for Solo Mode) — Task 1/2, `useAgents()` is used generically,
  no bee-name gating anywhere in the aggregation or rendering path. ✅
- No changes to `AgentChatManager`/schema, no changes to speech-bubble behavior — confirmed,
  no task touches those files. ✅

**Placeholder scan:** No "TBD"/"TODO"/"handle appropriately" in any step, every step has
literal code or exact commands.

**Type consistency:** `BeeDialogueLine` (Task 1) is consumed identically in Task 2
(`renderBeeDialogueLine`, `useBeeDialogue`'s return type). `AgentSnapshot` (Task 1) is
internal to the hook file and not consumed elsewhere, correctly scoped. `useAgents()`
(pre-existing, `TldrawAgentAppProvider.tsx`) is consumed with the correct zero-arg,
`TldrawAgent[]`-returning signature in Task 2. `agent.beeName`/`agent.beeColor` (pre-existing
`TldrawAgent` fields) are read with matching names in Task 1's snapshot construction.

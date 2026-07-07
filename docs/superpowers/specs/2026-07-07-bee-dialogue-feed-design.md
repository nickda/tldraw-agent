# Bee Dialogue Feed: readable, attributed transcript of what each bee says

Branch: `feat/bee-dialogue-feed`

## Summary

Team Mode's `ChatPanel` currently renders only the focused agent's chat history
via `useAgent()` -> `app.agents.getAgent()`, which always returns index 0 (the
planner, Beeyonce). Executor messages (MacBee, WannaBee) only surface as
transient speech bubbles above their sprite (`useLatestBeeMessage`,
`BEE_SPEECH_DURATION_MS = 12000`), and disappear once the bubble fades. There
is no persistent, readable transcript of what any bee said, and the existing
`ChatHistory` view (dense action log: think/writePlan/dispatchExecutors/diffs)
is not designed for that purpose.

This adds a new **Bee Dialogue** view: a merged, chronologically-sorted,
larger-font transcript of every bee's spoken (`message`-type) lines, with
per-bee attribution (colored dot + name), replacing `ChatHistory` as the
default view in `ChatPanel`. The existing action log remains available behind
a tab switch, unchanged.

## Tab switch: Dialogue (default) vs Log

`ChatPanel`'s header currently has two right-aligned buttons (`Clear`, `+`).
Add two left-aligned tab buttons: **Dialogue** (new, default) and **Log**
(existing `ChatHistory`, renders the focused/planner agent only, exactly as
today). A local `useState<'dialogue' | 'log'>('dialogue')` in `ChatPanel`
controls which view renders below the header. Switching tabs does not affect
agent state, chat history, or the canvas, it is purely a view toggle.

The `Log` tab's content and behavior are **unchanged**: still `<ChatHistory
agent={agent} />` where `agent` is the focused agent (always the planner in
Team Mode). No per-bee selector is added to the Log tab, that is out of scope.

## Bee Dialogue content: what counts as a spoken line

Only chat history items where `item.type === 'action'`, `item.action._type
=== 'message'`, and `item.action.complete === true` count as a spoken line.
Streaming/incomplete message actions are not rendered (matches the existing
`useLatestBeeMessage` filter, and avoids flicker in a persistent transcript).
No other action types (`think`, `writePlan`, `claimItem`, `dispatchExecutors`,
`delegateFix`, `review`, etc) appear in this view, those stay exclusive to the
Log tab.

## Cross-agent ordering: the wall-clock timestamp problem

Each `ChatHistoryActionItem`'s `action.time` field is `Date.now() -
startTime`, an elapsed-duration-since-that-specific-action-started-streaming
value (see `worker/do/AgentService.ts`), scoped per action, per agent. It is
**not** a shared wall clock and cannot be used to interleave messages from
different agents chronologically, two agents' `time: 200` values do not mean
"the same moment."

Fix: a new hook stamps each message with `Date.now()` the first time it is
observed as complete, keyed by `(agent.id, historyIndex)`, cached in a
`Map` inside a `useRef`. Because the stamp is assigned once per key on first
observation (not recomputed on every render), relative ordering across agents
reflects real observation order, which in a single-threaded reactive UI
matches real spoken order closely enough for a narrative transcript. Exact
sub-millisecond wall-clock fidelity is not a requirement here, this is a
readability feature, not an audit log.

## Reset detection

`Clear` and `+` both eventually call `agent.reset()` on every agent
(`AgentAppAgentsManager.getAgents()` iterated in `ChatPanel.handleClearAll`
and `handleNewChat`), which empties `AgentChatManager`'s `$chatHistory` back
to `[]`. Because the new hook's stamp cache is keyed by `(agent.id,
historyIndex)`, and `agent.id` is stable across a reset (the same `TldrawAgent`
instance is reset in place, not replaced), a stale cache entry could
theoretically collide with a new message that lands at the same index after a
reset.

Fix: track each agent's last-seen `history.length` in the same ref. If a
given agent's `history.length` is smaller than what was last seen for that
agent, treat it as a reset for that agent: drop all cached stamps whose key
starts with that `agent.id`. This is a targeted, per-agent invalidation, not
a global cache wipe, since `Clear`/`+` resets all agents in the same tick,
this fires for each agent independently but converges to the same empty-cache
result.

## Aggregation hook

New hook, `client/hooks/useBeeDialogue.ts`:

```ts
export interface BeeDialogueLine {
	key: string // `${agent.id}:${historyIndex}`
	agentId: string
	beeName: string
	beeColor: string
	text: string
	timestamp: number
}

export function useBeeDialogue(agents: TldrawAgent[]): BeeDialogueLine[]
```

Reads each agent's `chat.getHistory()` reactively (one `useValue` per agent,
consistent with the existing per-agent atom pattern, no new shared atom is
introduced). Filters to complete `message` actions, stamps/caches timestamps
per the rules above, flattens across all agents, sorts ascending by
`timestamp`, returns the merged array. Purely derived, no side effects beyond
the internal ref cache.

This hook is role-agnostic. In Solo Mode (`useAgents()` returns a single
agent), it degrades to "that one agent's message history in order", which is
correct and requires no special-casing.

## Rendering: BeeDialogueFeed component

New component, `client/components/BeeDialogueFeed.tsx`, replacing
`<ChatHistory agent={agent} />` when the Dialogue tab is active:

- Calls `useAgents()` to get all agents, passes them to `useBeeDialogue`.
- Renders each `BeeDialogueLine` as: a small colored dot (`beeColor`) plus
  the bee's name in a header row, then the message text below it in its own
  row. Font size `16px` for the message text (existing chat panel text runs
  10-12px throughout, speech bubbles are 12px, 16px is a clear, deliberate
  step up without breaking the panel's fixed width).
- Reuses the exact auto-scroll pattern from `ChatHistory.tsx`
  (`historyRef` + `previousScrollDistanceFromBottomRef` + `onScroll`
  handler): auto-scrolls to the newest line unless the user has scrolled up,
  in which case their position is preserved.
- Fixed-height, internally-scrolling container (`.chat-history`'s existing
  `height: 100%; overflow-y: auto` pattern, new CSS class
  `.bee-dialogue-feed` mirrors it), not "grows with page."
- Empty state (no messages yet): render nothing extra, an empty scroll
  container is acceptable, matches `ChatHistory`'s behavior with zero
  sections.

## Out of scope

- No changes to `AgentChatManager`, `ChatHistoryItem`, or the action schema.
  The timestamp problem is solved entirely client-side in the new hook.
- No per-bee filter/selector in either tab.
- No persistence of dialogue history across a page reload beyond whatever
  tldraw's existing `persistenceKey` already persists for agent state (this
  spec does not add or change persistence behavior).
- No changes to the transient speech-bubble behavior in `BeeAvatarOverlay.tsx`,
  both the bubble and the new persistent feed read from the same underlying
  chat history independently, the bubble is not being removed or replaced.

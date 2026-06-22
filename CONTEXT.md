# Domain Context: tldraw-agent

## Glossary

### Backend
The server that runs the agent loop and streams actions to the client over
`/stream` (SSE). Two interchangeable backends share one core (`AgentService`,
prompt builders, schemas, streaming parser):

- **Cloudflare backend** — the original. Cloudflare Worker + Durable Object
  (`worker/`), bundled by `@cloudflare/vite-plugin`. Inference goes to cloud
  providers (Anthropic / Google / OpenAI). This is the demo/backup path.
- **Local backend** — a Node + Hono server (`server/`) that reuses
  `AgentService` and points inference at a **local model** served by koboldcpp
  (OpenAI-compatible endpoint, `provider: 'local'`). Target: Raspberry Pi.

Selected by `AGENT_BACKEND` (`local` → Node server + vite proxy; default →
Cloudflare). The client always calls the relative path `/stream`; the backend
must serve it same-origin. See ADR-0001.

### Fairy
A named AI agent presence on the canvas. Represented as an animated SVG sprite that tracks the agent's current drawing location and expresses emotional state. A Fairy is a first-class domain entity — not a generic "cursor" or "indicator." In the single-agent v1, one Fairy corresponds to one TldrawAgent. In the multi-agent 10x vision, each agent has its own named Fairy with distinct personality.

**Canonical names for code:** `Fairy`, `FairyState`, `FairySprite`, `FairyAvatarOverlay`, `useFairyPosition`.

**Avoid:** `AgentCursor`, `AgentPresenceIndicator`, `AgentAvatar` (too generic; loses the personality and multi-agent semantics).

### Fairy Sprite
The Fairy's visual representation. Inline SVG (~40px), styled after the fairies.tldraw.com design: stick-figure body with a round smiley head, two pairs of dragonfly-style wings, arms, and legs. Black outline stroke, white fill body, transparent background. Wings animate via CSS keyframes (flutter). Drawing state mirrors the sprite horizontally (`scaleX(-1)`). Annoyed state triggers a shake keyframe. No emoji — custom SVG paths.

### Fairy Name
A whimsical display name generated fresh each time a Fairy mounts (e.g., "Dick Cindersmith", "Bonnie Kettlewick"). Not derived from the model ID. `generateFairyName()` picks randomly from a curated hardcoded list of ~25 full names. Called once via `useMemo(() => generateFairyName(), [])` inside `FairyAvatarOverlay`. Stable for the lifetime of the component instance. No persistent identity across page reloads or sessions.

`modelNameToFairyName()` is NOT part of the domain — not implemented.

### Fairy-Agent Relationship
A Fairy is a property of a TldrawAgent — 1:1 mapping. The Fairy's position atom (`$fairyPosition`) lives on `AgentRequestManager` inside the agent. `FairyAvatarOverlay` receives the agent as a prop and reads from it directly. Multi-agent v2 instantiates one `FairyAvatarOverlay` per agent.

### FairyState
The emotional/behavioural state of a Fairy. Three values:
- `idle` — agent has an active request but no position-moving action is currently executing. Fairy is visible at its last position, bobbing and wings fluttering. Includes all `think`, `message`, `count`, and other non-spatial actions.
- `drawing` — a position-moving action (`create`, `place`, `pen`, `move`, etc.) is currently executing. Fairy faces away (`scaleX(-1)`).
- `annoyed` — user has held mousedown on the Fairy sprite for >2 seconds. Easter egg.

Before the Fairy's first position is set (`$fairyPosition = null`), the Fairy component is hidden. There is no `idle` state for a hidden Fairy.

### Fairy Position
The page-space canvas coordinates `{x: number, y: number}` of the point the Fairy is currently tracking. Stored as a tldraw `Atom` in page-space. Used **directly** as CSS `left/top` in the overlay — **do not convert via `pageToViewport` or `pageToScreen`**. The tldraw `Overlays` slot applies the camera CSS transform, so page coordinates are the correct CSS coordinates inside it. Converting via `pageToViewport` would double-count the camera pan and cause the fairy to move 2× during scroll.

The atom is `null` only before the Fairy's first action fires (Fairy not yet visible). Once a position is set, it is **never reset to null** — the Fairy stays at its last position when the agent task ends, continuing to bob and flutter wings in `idle` state. The Fairy disappears only on full page reload.

`FairyAvatarOverlay` returns null when `pagePosition` is null, so the Fairy component is hidden before the first position is set. After that, it is always mounted.

### Fairy Drag
User can drag the Fairy to reposition it. Drag writes page-space coordinates directly to `$fairyPosition` via `agent.requests.setFairyPosition()`. Agent position always overrides — the next agent action will move the fairy back. Drag is a "get out of my way" gesture, not a persistent preference.

While dragging (`activePointerIdRef.current !== null`), the Fairy's `motionState` must not update. `drawing` state (face-away) is only for agent-driven position changes. The `useEffect` that sets `drawing` must bail out when drag is active.

### Fairy Placement
Two placement modes for `getFairyPositionFromBounds`:
- `center` — Fairy tracks the center of the shape's bounding box while an action is in progress.
- `resting` — Fairy moves to the bottom-right corner of the bounding box plus a clearance offset, used when an action completes so the Fairy stops obstructing the finished drawing.

The resting offset is a **screen-space intent** (clear the ~40px sprite): it must be converted to page-space using the current zoom level before being stored as a `FairyPosition`. Formula: `pageOffset = FAIRY_RESTING_OFFSET_PX / zoomLevel`. Hardcoding the offset in page-space is wrong — at low zoom the Fairy barely moves; at high zoom it overshoots.

**Timing:** `center` is used for every per-action position update (including `complete: true` streaming finals). `resting` fires exactly once per request, after `Promise.all(actionPromises)` resolves, using the last shape bounds touched during that request. Do NOT use `complete` flag to gate `resting` — discrete (non-streaming) actions always arrive as `complete: true` and would always skip `center` if gated this way.

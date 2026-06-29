# Domain Context: tldraw-agent

## Glossary

### Backend
The server that runs the agent loop and streams actions to the client over
`/stream` (SSE). Two interchangeable backends share one core (`AgentService`,
prompt builders, schemas, streaming parser):

- **Cloudflare backend**: the original. Cloudflare Worker + Durable Object
  (`worker/`), bundled by `@cloudflare/vite-plugin`. Inference goes to cloud
  providers (Anthropic / Google / OpenAI / Bedrock). This is the demo/backup
  path.
- **Local backend**: a Node + Hono server (`server/`) that reuses
  `AgentService` and points inference at a **local model** served by koboldcpp
  (OpenAI-compatible endpoint, `provider: 'local'`). Target: Raspberry Pi.

Selected by `AGENT_BACKEND` (`local` → Node server + vite proxy; default →
Cloudflare). The client always calls the relative path `/stream`; the backend
must serve it same-origin. See ADR-0001.

The Node server has a third `AGENT_BACKEND=bedrock` mode that pins every prompt
to a Bedrock model (`AGENT_BEDROCK_MODEL`, default `bedrock-claude-sonnet-4-6`)
and never contacts koboldcpp. See ADR-0002.

### Bedrock provider
A cloud provider (`provider: 'bedrock'`), not a separate backend: the same
Claude models Claude Code runs, reached over Amazon Bedrock via
`@ai-sdk/amazon-bedrock`. Model ids are **region-scoped inference profile ids**
(`us.anthropic.claude-...`); the `id` differs from the `name` (like `local`), so
the bedrock path bypasses the `isValidModelName(model.modelId)` guard. Auth is
either a bearer token (`AWS_BEARER_TOKEN_BEDROCK`, takes precedence) or SigV4
from temporary SSO credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
`AWS_SESSION_TOKEN`). `AWS_REGION` must match the model-id prefix and the region
the IAM identity is authorized to invoke in. Caching uses
`providerOptions.bedrock.cachePoint`, not Anthropic's `cacheControl`. See
ADR-0002.

### Fairy
A named AI agent presence on the canvas. Represented as an animated SVG sprite that tracks the agent's current drawing location and expresses emotional state. A Fairy is a first-class domain entity, not a generic "cursor" or "indicator." In the single-agent v1, one Fairy corresponds to one TldrawAgent. In the multi-agent 10x vision, each agent has its own named Fairy with distinct personality.

**Canonical names for code:** `Fairy`, `FairyState`, `FairySprite`, `FairyAvatarOverlay`, `useFairyPosition`.

**Avoid:** `AgentCursor`, `AgentPresenceIndicator`, `AgentAvatar` (too generic; loses the personality and multi-agent semantics).

### Fairy Sprite
The Fairy's visual representation. Inline SVG (~40px), styled after the fairies.tldraw.com design: stick-figure body with a round smiley head, two pairs of dragonfly-style wings, arms, and legs. Black outline stroke, white fill body, transparent background. Wings animate via CSS keyframes (flutter). Drawing state mirrors the sprite horizontally (`scaleX(-1)`). Annoyed state triggers a shake keyframe. No emoji; custom SVG paths.

### Fairy Name
A whimsical display name generated fresh each time a Fairy mounts (e.g., "Dick Cindersmith", "Bonnie Kettlewick"). Not derived from the model ID. `generateFairyName()` picks randomly from a curated hardcoded list of ~25 full names. Called once via `useMemo(() => generateFairyName(), [])` inside `FairyAvatarOverlay`. Stable for the lifetime of the component instance. No persistent identity across page reloads or sessions.

`modelNameToFairyName()` is NOT part of the domain; not implemented.

### Fairy-Agent Relationship
A Fairy is a property of a TldrawAgent (1:1 mapping). The Fairy's position atom (`$fairyPosition`) lives on `AgentRequestManager` inside the agent. `FairyAvatarOverlay` receives the agent as a prop and reads from it directly. Multi-agent v2 instantiates one `FairyAvatarOverlay` per agent.

### Team Mode
The multi-agent run: one Planner Fairy plus two Executor Fairies (fixed count). This is the **default**. A toggle drops back to the single-agent path (one Fairy in `working` mode talking directly to the user) for trivial requests where spinning up a planner + two executors + review is overkill. Both paths coexist; single-agent is the opt-out fast lane.

### Agent Role
A fixed function an agent (and its Fairy) plays in a Team Mode run. Two roles:
- **Planner**: decomposes the user's request into a Shared Plan (with per-item layout regions), dispatches the Executors, then reviews their work and issues fix directions. Exactly one Planner per run. The user always talks to the Planner; it is the orchestrator.
- **Executor**: claims and carries out Plan Items inside their assigned regions. Exactly two Executors, running concurrently.

A role is a property of an agent, distinct from its whimsical Fairy Name (the name is cosmetic identity; the role is behaviour). The role is enforced by a dedicated **mode** (`planning` / `executing`) whose action set is the model's grammar: the Planner physically cannot emit a draw action, an Executor physically cannot rewrite the plan. Roles are persisted (which Fairies exist, their roles and names survive reload); the Shared Plan and claim state are ephemeral (in-memory only) so a rare mid-run reload returns the Fairies to idle rather than resuming orphaned claims. Already-drawn shapes survive via the tldraw store.

### Shared Plan
The single ordered list of Plan Items produced by the Planner that all Executors claim from. Unlike the per-agent todo list (`AgentTodoManager.$todoList`, private to one agent), the Shared Plan has one owner of truth visible to every agent in the run. The Planner writes it; Executors read and claim from it; the Planner reviews against it.

### Plan Item
One unit of work in the Shared Plan. Extends the existing `TodoItem` shape (`id`, `text`, `status`) with two fields: an `assignee` (the agent id that claimed it, or unset) and a `bounds` (the canvas region the item's work must stay inside). Status flows `todo` → `in-progress` → `done`. A `done` item may be reopened by the Planner's review into a fix.

The `bounds` makes the Shared Plan **spatial**: the Planner decides layout (which region each piece of work occupies) when it writes the plan, and the Executor draws only inside its claimed item's `bounds`. This is the clean role split: layout is the Planner's job, drawing is the Executor's. It also removes canvas contention by construction. Two Executors drawing concurrently cannot overlap because their claimed items occupy disjoint regions the Planner already laid out. Executor bounds-scoping reuses the existing `request.bounds` + `SetMyView` machinery.

### Claim
The atomic operation by which an Executor takes a Plan Item: a compare-and-set on the Shared Plan that sets `status: 'in-progress'` and `assignee: <self>` only if the item is still `todo`, otherwise reports the item already taken. Safe without locks because all agents run in one JavaScript event loop on one editor: a synchronous read-modify-write on the shared atom cannot interleave mid-update, so two Executors cannot claim the same item. "Concurrent" here means interleaved at `await` points, not OS-level parallel.

### Review Loop
The Planner phase after Executors finish: the Planner inspects the canvas against the Shared Plan, and for each defect issues a fix direction to a specific Executor (reopening or adding a Plan Item assigned to that Executor). Distinct from the existing single-agent `review` action, which self-schedules on the same agent rather than delegating to others.

The loop is bounded to **2 rounds** (the initial build, plus at most one fix pass) to avoid runaway token burn and the known runaway-generation failure mode. A `reviewRound` counter on the plan manager gates this; after the cap, the Planner must report a final "here's what we built" to the user regardless of remaining nits.

### Plan Manager
The owner of the Shared Plan in code. The plan itself is an `EditorAtom` so the claim actions (which run in action utils that only have an `editor`) can reach it, mirroring how `$agents` is an `EditorAtom` reached via `AgentAppAgentsManager`. An app-level `AgentAppPlanManager` wraps that atom for lifecycle and holds the reactive coordinator that detects "plan drained + all Executors idle" and fires the Review Loop (see Agent Role, Review Loop). This mirrors the existing split of `$agents` (EditorAtom) and `AgentAppAgentsManager` (wrapper).

### FairyState
The emotional/behavioural state of a Fairy. Three values:
- `idle`: agent has an active request but no position-moving action is currently executing. Fairy is visible at its last position, bobbing and wings fluttering. Includes all `think`, `message`, `count`, and other non-spatial actions.
- `drawing`: a position-moving action (`create`, `place`, `pen`, `move`, etc.) is currently executing. Fairy faces away (`scaleX(-1)`).
- `annoyed`: user has held mousedown on the Fairy sprite for >2 seconds. Easter egg.

Before the Fairy's first position is set (`$fairyPosition = null`), the Fairy component is hidden. There is no `idle` state for a hidden Fairy.

### Fairy Position
The page-space canvas coordinates `{x: number, y: number}` of the point the Fairy is currently tracking. Stored as a tldraw `Atom` in page-space. Used **directly** as CSS `left/top` in the overlay (**do not convert via `pageToViewport` or `pageToScreen`**). The tldraw `Overlays` slot applies the camera CSS transform, so page coordinates are the correct CSS coordinates inside it. Converting via `pageToViewport` would double-count the camera pan and cause the fairy to move 2× during scroll.

The atom is `null` only before the Fairy's first action fires (Fairy not yet visible). Once a position is set, it is **never reset to null**: the Fairy stays at its last position when the agent task ends, continuing to bob and flutter wings in `idle` state. The Fairy disappears only on full page reload.

`FairyAvatarOverlay` returns null when `pagePosition` is null, so the Fairy component is hidden before the first position is set. After that, it is always mounted.

### Fairy Drag
User can drag the Fairy to reposition it. Drag writes page-space coordinates directly to `$fairyPosition` via `agent.requests.setFairyPosition()`. Agent position always overrides: the next agent action will move the fairy back. Drag is a "get out of my way" gesture, not a persistent preference.

While dragging (`activePointerIdRef.current !== null`), the Fairy's `motionState` must not update. `drawing` state (face-away) is only for agent-driven position changes. The `useEffect` that sets `drawing` must bail out when drag is active.

### Fairy Placement
Two placement modes for `getFairyPositionFromBounds`:
- `center`: Fairy tracks the center of the shape's bounding box while an action is in progress.
- `resting`: Fairy moves to the bottom-right corner of the bounding box plus a clearance offset, used when an action completes so the Fairy stops obstructing the finished drawing.

The resting offset is a **screen-space intent** (clear the ~40px sprite): it must be converted to page-space using the current zoom level before being stored as a `FairyPosition`. Formula: `pageOffset = FAIRY_RESTING_OFFSET_PX / zoomLevel`. Hardcoding the offset in page-space is wrong: at low zoom the Fairy barely moves; at high zoom it overshoots.

**Timing:** `center` is used for every per-action position update (including `complete: true` streaming finals). `resting` fires exactly once per request, after `Promise.all(actionPromises)` resolves, using the last shape bounds touched during that request. Do NOT use `complete` flag to gate `resting`: discrete (non-streaming) actions always arrive as `complete: true` and would always skip `center` if gated this way.

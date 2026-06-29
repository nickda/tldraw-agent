# ADR-0003: Multi-agent Team Mode — planner + two executors over a shared spatial plan

- Status: Accepted
- Date: 2026-06-29

## Context

The agent runs as a single `TldrawAgent` per editor. We want a Team Mode: one
Planner Fairy that decomposes a request into a plan, two Executor Fairies that
carry it out concurrently, then the Planner reviews and directs fixes. This is
the "multi-agent 10x vision" CONTEXT.md already names.

What already exists (discovered during design):

- `AgentAppAgentsManager` creates and tracks **N agents per editor**, each its
  own `TldrawAgent` + Fairy + indexed spawn position. `FairyAvatarOverlays` and
  `GoToAgentButton` already render one per agent.
- The `'other-agent'` request source is defined in `AgentRequest` but **never
  produced** — no action spawns or messages another agent.
- A single-agent `review` action exists; it self-schedules on the same agent.
- The mode system (`AgentModeManager`, `AGENT_MODE_DEFINITIONS`) scopes which
  actions an agent can emit; the action set **is** the model's JSON grammar.
- `TodoItem` (`id`, `text`, `status`) + a per-agent private `$todoList`.

So the agent-lifecycle scaffolding is built; the orchestration (plan ownership,
inter-agent dispatch, cross-agent review) is not.

Hard constraints:

- **One JavaScript event loop, one editor.** All agents run client-side in the
  same loop. "Concurrent" means interleaved at `await` points, not OS threads.
- **Backend concurrency varies.** Each agent opens its own `/stream`. Cloud and
  Bedrock serve concurrent requests as true parallel model calls; local
  koboldcpp is one instance and serializes them.
- **Runaway generation** is a known local failure mode (see drawing-quality
  work), so any review loop must be bounded.

## Decision

Add **Team Mode** (the default): one Planner + two Executors, fixed count. A
toggle falls back to the existing single-agent path for trivial requests.

- **Parallel executors.** Both Executors draw at once (true parallel on
  Bedrock/cloud; serialized but functional on local koboldcpp).
- **Shared Plan, atomic claim.** The Planner owns one ordered list of Plan Items
  (`TodoItem` + `assignee` + `bounds`). An Executor claims an item with a
  compare-and-set on the shared list: set `in-progress` + `assignee` only if
  still `todo`. The single-event-loop property makes this safe without locks — a
  synchronous read-modify-write cannot interleave mid-update, so two Executors
  cannot double-claim. Executors loop claim→execute→claim until the plan drains.
- **Spatial plan.** Each Plan Item carries `bounds`; the Planner decides layout,
  the Executor draws only inside its claimed region. Disjoint regions make
  concurrent drawing collision-free by construction. Reuses `request.bounds` +
  `SetMyView`.
- **Planner dispatches.** When the Planner finishes writing the plan, it spawns
  and prompts the Executors (`'other-agent'` source's first real producer). The
  user only ever talks to the Planner.
- **Reactive coordinator.** An app-level `AgentAppPlanManager` holds the plan as
  an `EditorAtom` (so claim actions, which only have an `editor`, can reach it —
  mirroring `$agents`). A `react()` on "no `todo`, no `in-progress`, every
  Executor idle" fires the Review Loop exactly once per round (guard flag).
- **Bounded Review Loop.** The Planner reviews the canvas against the plan and
  reopens/adds Plan Items assigned to specific Executors. Capped at **2 rounds**
  (build + one fix pass) via a `reviewRound` counter, then a mandatory final
  report to the user.
- **Role enforcement by mode.** New `planning` and `executing` modes whose action
  sets enforce roles in the grammar: the Planner cannot emit draw actions, an
  Executor cannot rewrite the plan. New actions: `writePlan`, `dispatchExecutors`,
  `delegateFix` (planner); `claimItem` (executor). The single-agent `working`
  mode is unchanged.
- **Differentiation.** Distinct sprite per Fairy (Planner one hue; the two
  Executors a shared style with per-Fairy accent) plus the role-scoped action
  sets. Whimsical names via the existing `generateFairyName()`. The two
  Executors stay interchangeable so the compare-and-set load-balancing holds.
- **Persistence.** Roles + names persist (stable team across reloads); the
  Shared Plan and claim state are ephemeral. A mid-run reload returns Fairies to
  idle rather than resuming orphaned claims; drawn shapes survive via the tldraw
  store.

Considered and rejected:

- **Sequential executors.** No contention and runs on local, but loses the
  parallel showcase. Parallel + spatial plan removes contention anyway.
- **Pre-assigned items (no claim).** No race, but no dynamic load balancing; a
  heavy item stalls one Executor while the other idles.
- **Central queue manager.** Cleanest ownership but most new code; the
  compare-and-set on a shared atom is already race-free here.
- **Executor specialties** (structure vs text Fairy). Cute, but specialty
  filtering fights the pure load-balancing claim model. Defer to v2.
- **Prose-only role hints.** A single `working` mode + "you are the planner,
  don't draw" prose. Rejected: the model can ignore prose; the action set is the
  honest enforcement (consistent with "code enforces invariants").
- **Resume mid-run on reload.** Orphaned-claim edge cases for little value; the
  IndexedDB-corruption history argues against more persisted run state.
- **Configurable agent count.** The claim loop is count-agnostic, so going
  configurable later is a constant change, not a rearchitect. Hardcode 3 now.

## Consequences

- The Planner becomes a real orchestrator; `'other-agent'` finally has a
  producer. Inter-agent dispatch + cross-agent review are new surfaces.
- `TodoItem` gains `assignee` + `bounds`; the plan moves from per-agent private
  state to an app-owned `EditorAtom`.
- Team Mode parallel is a Bedrock/cloud feature; local koboldcpp runs it
  degraded (serialized at the model). Documented, not gated.
- Chat is one unified transcript color-tagged by Fairy; input routes to the
  Planner. Single-agent stays the opt-out fast lane.
- Token cost: a trivial request in Team Mode spends planner + two executors +
  review; the single-agent toggle is the escape hatch.

## Validation plan

- A Team Mode request ("draw a house with a garden") on Bedrock yields a written
  Shared Plan with disjoint regions, both Executors claiming distinct items with
  no double-claim, a Review Loop that reopens at most one fix round, and a final
  Planner report. No canvas collisions. No orphaned `in-progress` items at end.
- Local koboldcpp runs the same flow serialized without crashing.
- Single-agent toggle still serves a trivial request through the unchanged
  `working` path.

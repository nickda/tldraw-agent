# Cross-agent shape ID resolution: implementation plan

Spec: `docs/superpowers/specs/2026-07-09-cross-agent-shape-id-resolution-design.md`

## Global constraints

- Fuzzy resolution resolves ONLY when exactly one candidate matches; zero or
  2+ returns null. Never guess among ambiguous ids.
- The retry cap is a hard 1: at most one rejection-feedback follow-up per
  dispatch, reset only on a `source !== 'self'` request. No path may schedule
  a second. This is the exact property whose absence caused the reverted loop.
- Do not reintroduce the reverted `d9dd475` code shape (unbounded
  `rejectedActions` -> `schedule` with no counter). The counter gate is
  mandatory.
- Keep injected shape-id payloads scoped to the shapes in play, not the whole
  canvas.

## Task 1: Conservative fuzzy resolution in `ensureShapeIdExists`

File: `client/AgentHelpers.ts`

After the existing `shapeIdMap` lookup and the exact
`editor.getShape(createShapeId(id))` check, before `return null`:

- Compute `base(id)` = id with a trailing `-<digits>` removed.
- Enumerate current page shapes: `editor.getCurrentPageShapes()`, map each to
  its simple id (strip `shape:` — reuse `convertTldrawIdToSimpleId` if
  convenient, or `.slice(6)`).
- Find all simple ids whose `base` equals `base(requestedId)`.
- If exactly one, return it (as `SimpleShapeId`). Else return null.

Extract the base-normalization and the candidate search into small pure
helpers so Task 4 can unit-test them without an editor.

## Task 2: Per-agent retry counter + reset

File: `client/agent/TldrawAgent.ts` (field) + `client/modes/AgentModeChart.ts`
(reset).

- Add `shapeIdRetryCount = 0` field on `TldrawAgent` (public or with a small
  getter/setter/reset method — match how sibling per-turn state like
  `isActingOnEditor` is handled).
- Reset it to 0 whenever the agent starts handling a `source !== 'self'`
  request. The natural hook: in the request lifecycle where `onPromptStart`
  fires with the request, or directly in `prompt()` when
  `request.source !== 'self'`. Pick the single place that runs for every
  executor dispatch (`dispatchExecutors`, `delegateFix`, auto-dispatch all use
  `source: 'other-agent'`) and reset there.

## Task 3: Bounded rejection feedback in the request loop

File: `client/agent/TldrawAgent.ts` (the streaming request loop that calls
`sanitizeAction`).

- Collect complete actions dropped because `sanitizeAction` returned null
  (same collection point the reverted commit used — reuse the diff if helpful,
  but the scheduling logic MUST differ).
- After the stream ends, only if: not cancelled AND `rejected.length > 0` AND
  `this.shapeIdRetryCount === 0` AND no scheduled request already exists:
  - Build a follow-up message that (a) names each dropped action + its
    unresolved id and (b) lists the real in-scope shape ids (current page
    shapes within the request bounds, or all current simple ids if no bounds).
  - `this.shapeIdRetryCount = 1` then `schedule({ agentMessages: [...],
    source: 'self' })`.
- If `shapeIdRetryCount === 1`: do nothing (let the turn end; action stays
  dropped). This is the loop stopper.

## Task 4: Real ids through delegateFix

File: `client/actions/DelegateFixActionUtil.ts`

- Before building the executor correction prompt, resolve the shapes within
  `action` bounds (`{x,y,w,h}`) to their real simple ids
  (`editor.getCurrentPageShapes()` filtered by
  `editor.getShapePageBounds(shape)` inside the box, mapped to simple ids).
- Append those real ids to the correction `agentMessages` so the executor
  edits by ids that exist ("Shapes in this region: <id>, <id>, ...").
- Keep the list scoped to the bounds; do not dump the whole canvas.

## Task 5: Tests

Files: `client/AgentHelpers.test.ts` (new or extend),
plus a small test for the counter behavior where feasible.

- Fuzzy resolution: exact match returns id; single uniquified match
  (`tail` with only `tail-1` present) resolves to `tail-1`; no match returns
  null; ambiguous (`tail-1` and `tail-2` both present, request `tail`) returns
  null.
- Base-normalization helper: `tail-1` -> `tail`, `tail` -> `tail`,
  `a-b-2` -> `a-b`.
- Counter: starts 0; after scheduling feedback it is 1; a second rejection in
  the same dispatch does not schedule; a `source !== 'self'` request resets to
  0. (If the full loop is hard to unit-test, test the smallest pure piece and
  cover the rest in Task 6 live.)

## Task 6: Live verification (controller, after Tasks 1-5)

Run `dev-bedrock`, reproduce the cow (tail + eye) multi-executor fix via
`browse`:

- Confirm a delegated fix to a shape another executor drew actually lands
  (shape moves on canvas, not just narrated).
- Confirm NO loop: grep the server log for "Some of your actions did not
  apply" — it must appear at most once per dispatch, never the dozens-in-a-row
  pattern from the reverted commit.
- Confirm normal draws/reviews still complete and terminate.

## Self-review: spec coverage

- Global resolution (decision 1): Task 1 uses `getCurrentPageShapes`, agent-
  agnostic. ✓
- B primary (decision 2/3): Task 4 (delegateFix real ids). ✓ Review-context
  ids: covered by delegateFix carrying real bounds ids; a dedicated review
  part is optional and can be deferred if Task 4 proves sufficient live.
- Safety net bounded, cap 1 (decision 4): Tasks 2+3. ✓
- Cap reset on non-self (decision 5): Task 2. ✓
- Conservative unambiguous fuzzy (decision 6): Task 1 + Task 5 tests. ✓
- Loop cannot recur: Task 3 gate + Task 5 counter test + Task 6 log check. ✓

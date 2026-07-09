# Cross-agent shape ID resolution: design spec

## Problem

In Team Mode an Executor's `sanitizeAction` rejects a move/update/delete/etc
whose `shapeId` does not resolve to a real shape. `ensureShapeIdExists`
(`client/AgentHelpers.ts`) resolves an id in two ways: a per-request
`shapeIdMap` (only populated for shapes THIS request created/uniquified), then
a global `editor.getShape(createShapeId(id))` exact-match. If neither hits, it
returns `null` and the action is silently dropped.

The global editor lookup already covers "any shape by any agent" when the id
is exact. The real gap is **exact-match-only**: the model names an id that is
close but not identical to the real shape id. Two dominant causes:

1. **Creation-time uniquification.** `ensureShapeIdIsUnique` renames a
   colliding `tail` to `tail-1` at creation. The model, working from memory or
   from a stale description, later references `tail`, which no longer exists.
2. **Ids the model cannot see.** Peripheral shapes (outside the viewport,
   `convertTldrawShapesToPeripheralShapes`) carry no id at all. An Executor
   that navigates and then edits a now-peripheral shape, or a `delegateFix`
   whose target id the Planner guessed, references an id it never accurately
   observed.

This one root cause produced both of today's failures:
- **Silent drop** (the cow's left eye "moved" in narration but never moved on
  canvas): resolution missed, action dropped, no signal.
- **Infinite loop** (reverted commit `d9dd475`): a fix that fed rejected
  actions back to the model with no retry cap re-prompted on every miss,
  bouncing between MacBee and WannaBee forever on the cow's tail.

## Decisions (from grilling)

1. **Ownership model B: any executor edits any shape.** Shapes are shared
   canvas state; whoever is dispatched fixes whatever is wrong. Resolution
   must be global, not per-agent. (The per-agent `shapeIdMap` was never the
   blocker; the global editor fallback already exists.)

2. **Fix = B primary + A safety net.** B: make the model see real, exact shape
   ids so it stops guessing. A: a conservative fuzzy fallback for the residual
   misses.

3. **B scope: the full review to delegateFix to executor path carries real
   ids end to end.** This is the exact path that loops/drops today. Not all
   executor turns (avoids the prompt-token growth flagged separately).

4. **Safety net A: bounded feedback, hard cap of 1 retry.** This is the
   reverted commit's intent WITH the cap it lacked. On an unresolved id: tell
   the model once (naming the dropped action and showing the real in-scope
   ids), let it retry once, then stop. With B supplying real ids, the retry
   should almost always succeed, so the cap rarely triggers.

5. **Cap mechanism: a per-agent counter reset on non-self dispatch.** A fresh
   dispatch to an executor arrives with `source !== 'self'` (from
   `dispatchExecutors` / `delegateFix` / auto-dispatch), which is the same
   reset boundary the existing `MessageActionUtil` executor-voice gate keys
   on. Increment the counter each time rejection feedback is scheduled; refuse
   to schedule again once it hits 1. Loop-proof.

6. **Fuzzy rules: conservative, unambiguous-only.** Strip the `shape:` prefix
   (already done), try uniquified-suffix variants (`tail` -> `tail-1`,
   `tail-2`, ...), match only against current page shape ids, and resolve ONLY
   if exactly one candidate matches. Zero or 2+ candidates -> give up to the
   bounded retry. Never guesses among ambiguous ids, so it cannot mis-target.

## Design

### A. Conservative fuzzy resolution (`ensureShapeIdExists`)

After the existing `shapeIdMap` and exact-match checks fail, before returning
null:

- Build the set of current page shape ids (simple ids, prefix stripped).
- Generate candidate variants of the requested id: the id itself, and
  suffix-normalized forms (strip a trailing `-N`, and/or append `-1..-N` up to
  the count of existing shapes sharing the base).
- Collect real shape ids whose base (id with any trailing `-N` removed) equals
  the requested id's base.
- If exactly one such shape id exists, return it. Otherwise return null.

This stays a pure function of the editor's current shapes; no new state.

### B. Real ids through the review/fix path

- **delegateFix**: the Planner's `delegateFix` action already names a target
  in `text`. Ensure the executor's correction prompt includes the real,
  current shape ids in the fix bounds region (resolve the shapes inside
  `action`'s bounds and list their exact ids), so the executor edits by an id
  that exists rather than by whatever the Planner wrote.
- **Review context**: when the Planner reviews, its context should surface each
  done shape's real id (so the id it puts in `delegateFix` is real to begin
  with). Reuse the existing focused/blurry-shape id plumbing rather than adding
  a new part where possible.
- Keep the payload scoped to the shapes in play (the fix region / reviewed
  items), not the whole canvas, to avoid unbounded prompt growth.

### A. Bounded retry feedback

- Add a per-agent counter (e.g. `shapeIdRetryCount`), reset to 0 when the agent
  begins handling a `source !== 'self'` request.
- When one or more complete actions are dropped for unresolved shapeIds in a
  turn AND the counter is 0 AND no continuation is already scheduled: schedule
  ONE `self` follow-up that (a) names the dropped actions and their unresolved
  ids and (b) lists the real in-scope shape ids, then set the counter to 1.
- When the counter is already 1: do not schedule; let the turn end. The action
  stays dropped (degrades to the old silent behavior) but never loops.

## Out of scope

- Owner-tracking per shape (rejected: model B means no owner constraint).
- Broad similarity/edit-distance matching (rejected: mis-target risk).
- Injecting full shape-id lists into every executor turn (rejected: prompt
  token growth).
- The separate cross-cutting review-latency / token-growth work.

## Testing

- Unit: `ensureShapeIdExists` fuzzy path — exact match, single uniquified
  match resolves, zero match returns null, ambiguous (2+) returns null.
- Unit: the retry-cap counter — increments once, refuses a second schedule,
  resets on a non-self request.
- Live (`browse` + `dev-bedrock`): reproduce the cow tail / eye multi-executor
  fix; confirm the edit lands (not silently dropped) and there is NO loop
  (the "Some of your actions did not apply" line appears at most once per
  dispatch, never dozens of times).

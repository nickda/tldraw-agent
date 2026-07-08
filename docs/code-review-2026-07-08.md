# Code Review — 2026-07-08

Full-codebase review of `tldraw-agent` (fork of tldraw/agent-template with local-model backend).
Scope: `server/`, `worker/`, `shared/`, `client/`, build config. ~17k lines of TS reviewed.
High-severity findings were verified against source before inclusion.

**Provenance:** fork-added code = `server/index.ts`, bedrock/local providers in `shared/models.ts` +
`AgentService.ts` + `buildStreamConfig.ts`, preamble/trailing-fence handling in `closeAndParseJson.ts`,
both worker test files, Team Mode actions. The DO, routes, prompt-part system, and streaming cursor
logic are upstream template code.

---

## High severity

### H1. Stream parser silently drops actions (verified)
`worker/do/AgentService.ts:203`
The cursor advance is `if (actions.length > cursor)`, so at most one action completes per text chunk.
If a single chunk completes 2+ actions (likely with local models delivering large chunks), trailing
actions are never yielded; only `maybeIncompleteAction` (index `cursor-1`) is flushed at stream end.
Affects both backends since they share `AgentService`. No test coverage.
**Fix:** `while (actions.length > cursor) { ... }`, and drain `actions.slice(cursor)` after the stream ends. Add regression test.

### H2. Agent can get permanently stuck "generating" (verified)
`client/agent/TldrawAgent.ts:373-427`
`setIsPrompting(true)` (L373) has no `try/finally`. Throws from `onPromptStart` (L377), the
`onPromptEnd` loop (L390-399), the active-mode error (L407), `Promise.all` (L418), or the nested
`prompt()` (L426) leave `$isPrompting=true` forever; all subsequent prompts are rejected until `reset()`.
**Fix:** wrap body in `try/finally { setIsPrompting(false) }` (careful with the nested path).

### H3. `setMode` throws on same-mode transition (makes H2 reachable)
`client/agent/managers/AgentModeManager.ts:52-54`
Acknowledged TODO. Lifecycle hooks call `setMode('idling')` on cancel/end paths where the agent may
already be idling, converting benign transitions into crashes.
**Fix:** early-return instead of throw.

### H4. No `res.ok` check on `/stream` fetch
`client/agent/TldrawAgent.ts:787-795`
A 4xx/5xx (HTML error body) yields a silently empty stream: no error, no toast, prompt "succeeds" doing nothing.
**Fix:** `if (!res.ok) throw new Error(...)`.

### H5. Deployed worker is unauthenticated and unmetered
`worker/worker.ts:7`, `worker/routes/stream.ts:20`
CORS `origin: '*'`, no auth, no rate limiting on `/stream`. Anyone with the URL runs inference on your
OpenAI/Anthropic/Google/Bedrock keys. Upstream code, but you own the keys.
**Fix:** bearer token or origin allowlist + rate limiting before any CF deployment.

### H6. Request body unvalidated; worker lets client pick the model
`worker/do/AgentDurableObject.ts:44`, `server/index.ts:66`
Body cast to `AgentPrompt` with zero validation; malformed part types throw inside
`getPromptPartDefinition` (`shared/types/PromptPart.ts:102`). On the worker path the client also selects
the model (`getModelName`), including the most expensive ones. The Node server pins; the worker doesn't.
**Fix:** zod-validate the prompt; allowlist models server-side.

### H7. Offline mode can silently spend cloud tokens
`server/index.ts:74-80`
Model pinning only runs `if (prompt.modelName)`. A request omitting that part falls through to
`DEFAULT_MODEL_NAME` (`claude-sonnet-4-5`) in `worker/prompt/getModelName.ts:19`, hitting cloud
Anthropic if the key is in env.
**Fix:** force-inject the modelName part when absent.

### H8. Auto-save fires on every streamed action delta
`client/agent/managers/AgentAppPersistenceManager.ts:140-168`
The watcher synchronously `JSON.stringify`s the entire app state (all agents' histories including full
`RecordsDiff` records) to localStorage on each chunk, dozens of times/sec while streaming. 5MB quota
will be hit on long sessions; failure only `console.warn`s.
**Fix:** debounce (~500ms); strip/compact diffs from persisted history.

---

## Medium severity

### Backend

**M1.** `worker/do/closeAndParseJson.ts:10-14` — Preamble stripping anchors on the *first* `{`; a prose
preamble containing a brace (`"I'll draw {something}..."`) breaks every parse for the rest of the stream,
yielding zero actions. Fix: search for `{"actions"` or retry from the next `{` on parse failure.

**M2.** `worker/do/closeAndParseJson.ts:26` — Escape check `string[i-1] === '\\'` misclassifies `\\"`
(escaped backslash + real closing quote) as an escaped quote. Count consecutive backslashes for parity.

**M3.** `worker/do/AgentDurableObject.ts:42-65` — Fire-and-forget IIFE with no `ctx.waitUntil` and no
abort propagation: on client disconnect the model stream keeps being pulled (token spend) until a write
rejects. The Node server handles `cancel()` (`server/index.ts:111`); the DO doesn't. Fix: mirror the
cancellation flag and pass `abortSignal` into `streamText`.

**M4.** `worker/routes/stream.ts:6` — Single `'anonymous'` DO shared by all users; concurrent prompts
interleave against one instance. Acknowledged in a comment; file an issue before multi-user deployment.

**M5.** `worker/do/buildStreamConfig.ts:94-99` — Assistant prefill appended for any provider with
`supportsPrefill !== false` including OpenAI, but `canForceResponseStart` (L129) only covers
anthropic/google. OpenAI doesn't continue assistant turns, so gpt models receive a dangling assistant
message whose text is never prepended to the parse buffer. Test at `buildStreamConfig.test.ts:99`
encodes the asymmetry; verify intentional, otherwise gate prefill on the same provider set.

**M6.** `worker/do/AgentService.ts:143-148` — Local token estimate only counts
`typeof content === 'string'`, but `toModelMessages` (`worker/prompt/buildMessages.ts:75-98`) emits
content arrays for user messages, so the estimate covers only the system prompt. Fix: sum text parts of
array content.

**M7.** `server/index.ts` — No `OPTIONS /stream` handler: genuine cross-origin POSTs fail preflight
despite the `Access-Control-Allow-*` response headers. SSE headers duplicated in three places (DO,
route, server). Fix: Hono `cors()` middleware + shared `sseHeaders` constant.

**M8.** `server/index.ts:27-31` + `AgentService.ts:38-43` — AWS vars default to `''`; explicit empty
strings passed to `createAmazonBedrock` override the SDK's default credential chain (profiles, instance
roles), producing confusing SigV4 errors. Fix: `process.env.X || undefined`.

**M9.** `AgentDurableObject.ts:57`, `server/index.ts:104-106` — Raw provider error messages streamed to
client (`{error: error.message}`); AI SDK errors can embed request/config details. Map to generic
message; log details server-side.

### Client / shared

**M10.** `client/agent/TldrawAgent.ts:453-458` — If `preparePrompt` throws (runs outside the `try`),
`clearActiveRequest()` is skipped; the stale active request triggers a spurious `cancel()` on the next
request (L447). Fix: `try/finally`.

**M11.** `client/agent/TldrawAgent.ts:380-387` — Errors from `request()` are `console.error`'d and
swallowed; `this.onError` never called, user sees no toast for a failed prompt.

**M12.** `client/agent/TldrawAgent.ts:813-829` — One malformed SSE JSON line aborts the entire stream;
server `data.error` and parse errors are flattened into the same rethrow, losing stacks. Fix: skip/log
unparseable chunks; throw only for explicit server error events.

**M13.** `client/agent/TldrawAgent.ts:390-399` — `onPromptEnd` loop has no iteration cap; two modes
whose hooks switch to each other loop forever. Add a max-iterations guard.

**M14.** `client/agent/TldrawAgent.ts:418-425` — Race: while `Promise.all(scheduledRequest.data)` is
pending, a concurrent `schedule()` writes a new merged scheduled request; `clearScheduledRequest()`
then silently drops it.

**M15.** `client/agent/managers/AgentAppTeamManager.ts:30-40, 256-259` — Static singleton `instance`
set in constructor, never cleared in `dispose()`: retains the disposed app (leak), misroutes
`triggerReviewCheck`/`triggerSlackGrumble` with two editors. Also `constructor(app: any)`. Contrast
`$agents` (correctly per-editor `EditorAtom`).

**M16.** `AgentAppTeamManager.ts:232-254` — `dispose()` → `reset()` → `ensureAtLeastOneAgent()` spawns
a new solo agent mid-teardown (after persistence watchers stopped), immediately disposed again. Guard
with an `isDisposing` flag.

**M17.** `AgentAppTeamManager.ts:163-207` — `checkReviewLoop`'s `reviewGuard` released on a 100ms timer
while the planner's review prompt is still running; staggered executor completions can double-trigger
reviews. Key the guard off `planner.requests.isGenerating()`/review round, not timers.

**M18.** `shared/format/convertTldrawShapeToFocusedShape.ts:222` — Arrow label read from
`shape.meta.text`, but the writer (`convertFocusedShapeToTldrawShape.ts:396`) stores `props.richText`
and nothing sets `meta.text`. Arrow labels invisible to the model, lost on round-trip. Use
`util.getText(shape)`.

**M19.** `shared/format/convertFocusedShapeToTldrawShape.ts:276-277` — Text `'center'` anchor case uses
`focusedShape.x/y` directly instead of the defaulted locals; `undefined` → `NaN` coordinates.

**M20.** `convertFocusedShapeToTldrawShape.ts:761,786` — Streaming shapes without an id fall back to
fixed `'streaming-shape' as any`; Team Mode's concurrent executors clobber each other. Make
per-agent/per-request unique.

**M21.** `convertFocusedShapeToTldrawShape.ts:229,706-734` — `getDummyBounds` creates and diff-reverts
a real store shape to measure text on every streaming delta, even for `top-left` anchor where bounds
are unused. Skip when unused; cache.

**M22.** `client/components/ChatPanel.tsx:38-77` vs `AgentAppTeamManager.promptPlanner:146` — Planner
system prompt duplicated; `promptPlanner()` is dead code that has drifted from the live prompt. Delete
one. Related dead code: `startCoordinator()`/`coordinatorCleanup` no-ops (`AgentAppTeamManager.ts:227-230`),
unused `getBeeScreenPosition` (`BeeAvatarOverlay.tsx:19`).

**M23.** `client/agent/TldrawAgentAppProvider.tsx:78-108` — App-creating effect depends on
`[editor, handleError, onMount, onUnmount]`; identity changes dispose and rebuild the whole agent system
mid-session, cancelling in-flight generation. Keep callbacks in refs; depend only on `editor`.

**M24.** `shared/format/*` — frame/image/video/embed/bookmark/highlight/group all collapse to
`'unknown'`, and `convertUnknownShapeToFocused` (`convertTldrawShapeToFocusedShape.ts:246-256`) drops
`w`/`h`, so the model can't reason about their extent.

---

## Low severity

**L1.** `client/AgentHelpers.ts:261-285` — Comment says "defensively strip the prefix" but no strip is
implemented; model-emitted `shape:foo` becomes `shape:shape:foo`. `ensureShapeIdIsUnique` is O(n) worst
case per id.

**L2.** `client/AgentHelpers.ts:516-531` — `roundBox`/`roundVec`/`applyOffsetToContextItem` mutate
inputs while sibling helpers return copies; invites aliasing bugs.

**L3.** `client/AgentHelpers.ts:493-495` — `ensureValueIsBoolean('no')`/`'0'` → `true` (only literal
`'false'` is falsy).

**L4.** Type safety — 43 `: any`/`as any` hits in client/shared. Notable: `onError: (e: any)` across
the public API (`TldrawAgent.ts:74,114`, `TldrawAgentApp.ts:69`), `AgentAppTeamManager` ctor,
`AgentTodoManager` mixing `TodoId` (push) with `number` (update/delete).

**L5.** `client/components/highlights/ContextHighlights.tsx:33-34` — `activeContextItems` is a fresh
array each render and is the dep of four `useValue` hooks, defeating memoization; highlights keyed by index.

**L6.** `client/agent/managers/AgentActionManager.ts:104-114` — `act()` calls `onError` *and* rethrows;
`TldrawAgent` then `console.warn`s the same error. Pick one reporting policy.

**L7.** `client/agent/managers/AgentLintManager.ts:250-337` — O(n²) pairwise polygon-overlap over all
created shapes at every prompt end; degrades on large team drawings. Bounds pre-sort or spatial hash.

**L8.** `client/components/BeeAvatarOverlay.tsx:164-180` — Effect uses `latestMessage.text` but depends
only on `latestMessage?.index`; safe only via `useLatestBeeMessage` filtering. Add `text` dep or comment.

**L9.** `client/hooks/useBeeDialogue.ts:147` — `aggregateBeeDialogue` mutates ref caches during render
(StrictMode double-stamps timestamps). Move behind `useMemo`/effect.

**L10.** `shared/format/convertTldrawShapeToFocusedShape.ts:193-203` — Lines assume exactly 2 points;
multi-point lines silently truncated. `index.localeCompare` is not a correct fractional-index sort; use
tldraw's `sortByIndex`.

**L11.** Oversized/duplicated — `TldrawAgent.ts` (836 lines): extract SSE client (`streamAgentActions`)
and the action-application loop. `convertFocusedShapeToTldrawShape.ts` (811): ~90% identical per-type
fallback boilerplate; table-drive it. `AgentModeDefinitions.ts`: identical 17-entry `parts` array
repeated three times.

**L12.** `AgentDurableObject.ts:40,47` — `response.changes` accumulates every action, never read: dead
code + per-stream memory growth.

**L13.** `AgentService.ts:99-108` — `stream()` is a pass-through wrapper around `streamActions`; delete
or fold in.

**L14.** `routes/stream.ts:19`, `AgentDurableObject.ts:73` — Manually set `Transfer-Encoding: chunked`
is a forbidden header in Workers; drop it.

**L15.** `AgentService.ts:171` — Temperature omitted only for bedrock (default 1) with no comment;
every other provider gets `temperature: 0`. Document or align.

**L16.** `AgentService.ts:170` — `maxOutputTokens: 65536` hardcoded for all providers; some models cap
lower and hard-fail. Move to `AgentModelDefinition`.

**L17.** `package.json` — Unused deps (grep-verified): `@google/generative-ai`,
`@worker-tools/json-stream`, `best-effort-json-parser`. Also `wrangler` belongs in devDependencies.

**L18.** `wrangler.toml:4` — `assets` has no `directory`; works only via `@cloudflare/vite-plugin`
injection; bare `wrangler deploy` fails.

**L19.** `server/index.ts:67-69` — First 100 chars of the user message logged to stdout on every
request; gate behind the debug part like the worker does.

**L20.** `tsconfig.json:4` — `@cloudflare/workers-types` and `node` globals in one shared project;
collisions masked by `skipLibCheck`. Per-target tsconfigs would restore real type safety. Test script
uses `bun test` but bun isn't declared anywhere.

**L21.** `.dev.vars` — Contains a live Anthropic API key. Properly gitignored, not tracked, absent from
history. Rotate if the folder is ever shared (it was readable by this review session).

---

## Test gaps

16 test files, good coverage of pure logic (`sharedPlan`, schedule merging, `beePosition`, dialogue
aggregation, `shouldSlack`, `buildStreamConfig`, `closeAndParseJson`, mode definitions).

Untested critical paths, in priority order:

1. `AgentService` cursor state machine (H1 would have been caught)
2. `prompt()` lifecycle + cancellation (H2)
3. Both ~800-line shared converters — a round-trip property test would have caught M18, M19, L10
4. SSE parsing / `streamAgentActions` (H4, M12)
5. `server/index.ts` model pinning (H7)
6. `AgentHelpers` offset/rounding, persistence load/save

---

## What's done well

One `AgentService` shared by the DO and Node server keeps backends from drifting; `buildStreamConfig`
extracted as a pure, tested function is the right seam; the `onError`-capture-and-rethrow around the AI
SDK's log-only error callback is a subtle correctness fix; `closeAndParseJson`'s trailing-fence handling
ships with regression tests documenting the Bedrock behavior that motivated it. Client side: clean
manager decomposition with consistent `reset()`/`dispose()` lifecycle, idiomatic tldraw atoms,
per-editor `EditorAtom`, pure functions deliberately extracted for testability. Why-comments throughout
(koboldcpp grammar, Bedrock cachePoint, prefill matrix) are better than most production code. Secrets
hygiene in git is correct.

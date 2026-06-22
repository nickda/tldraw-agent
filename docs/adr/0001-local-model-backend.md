# ADR-0001: Support a local-model backend via a Node server alongside the Cloudflare Worker

- Status: Accepted
- Date: 2026-06-22

## Context

The agent backend currently runs only as a Cloudflare Worker plus a Durable
Object (`worker/worker.ts`, `worker/do/AgentDurableObject.ts`, bundled by
`@cloudflare/vite-plugin`). Inference goes to one of three cloud providers
(Anthropic, Google, OpenAI) via the Vercel `ai` SDK in
`worker/do/AgentService.ts`, keyed by API keys in `worker/environment.ts`.

We want to run the agent on a Raspberry Pi against a **local model** served by
**koboldcpp** (OpenAI-compatible `/v1/chat/completions`, GBNF grammar support,
ARM64 builds). The Cloudflare edge runtime (`workerd`) is not a comfortable fit
for an offline, self-contained Pi box.

Constraints discovered during design:

- The Durable Object holds **no state**: `routes/stream.ts` uses a single
  `idFromName('anonymous')` instance, constructs `AgentService` fresh, and only
  streams SSE. The DO + Worker layers are pure plumbing.
- `AgentService` imports nothing Cloudflare-specific (only the `Environment`
  type). It is already runtime-agnostic.
- The client calls `/stream` as a **relative** path
  (`client/agent/TldrawAgent.ts:722`), so any replacement backend must serve
  `/stream` on the same origin as the app.

## Decision

Add a **second backend entry point in the same codebase** (a Node + Hono
server under `server/`) that reuses `AgentService`, `buildSystemPrompt`,
`buildMessages`, the action schemas, and the streaming parser unchanged. The
Cloudflare Worker stays as a living backup that shares the same core, so bug
fixes land in both paths.

Considered and rejected:

- **A — `wrangler dev` (workerd) on the Pi.** Keeps a Cloudflare-shaped
  dependency on an offline device; emulator overhead on weak ARM CPU.
- **C — client-only, browser calls the model directly.** Loses the worker's
  prompt-building logic and exposes the model endpoint to the browser.
- **Separate repo fork.** Forks the maintenance burden; fixes never flow back.

### Implementation shape

- **Local provider.** Add `'local'` to `AgentModelProvider` in
  `shared/models.ts` with a model entry (`supportsPrefill: false`, don't-care
  `id`). In `AgentService`, add
  `this.local = createOpenAI({ baseURL: env.LOCAL_MODEL_URL, apiKey: 'sk-noop' })`.
  Reuses the OpenAI SDK; no new dependency.
- **Route on the model definition, not the SDK provider string.** `AgentService`
  branches on the SDK's `model.provider` (`'anthropic.messages'`,
  `'openai.responses'`, etc.). The local model resolves to an `openai.*`
  provider string, so for the local path we must, keyed on
  `modelDefinition.provider === 'local'`:
  - **Bypass the `isValidModelName(model.modelId)` check** (hard blocker —
    koboldcpp reports its own loaded model id, which is not in
    `AGENT_MODEL_DEFINITIONS`).
  - Strip `providerOptions.openai` / `reasoningEffort` (koboldcpp does not
    understand these).
  - Set `canForceResponseStart = false` (matches `supportsPrefill: false`).
- **JSON correctness.** Test the existing prompt + prefill path first. If a
  small local model produces malformed action JSON, the known fix is
  koboldcpp's **GBNF grammar** sampling, generated from the action schema. Not
  built up front.
- **Context window.** The system prompt embeds the full JSON schema of all
  active actions (`buildSystemPrompt.ts` → `buildSchemaPromptSection`),
  realistically 6-10k tokens before canvas state. koboldcpp defaults to 4k ctx.
  koboldcpp must launch with an explicit large `--contextsize`. The schema
  section (scoped by `modePart.actionTypes`) is the trim point if a Pi cannot
  hold the prompt. No code change; this is a launch-flag + measurement concern.
- **Backend selection.** Env-gated vite: `AGENT_BACKEND=local` swaps the
  `cloudflare()` plugin for a `server.proxy` to the Node server (Mac dev, keeps
  HMR). The Pi runs the prod build: `node server` serving `dist/` statically and
  handling `/stream` same-origin. The default `dev` (Cloudflare) path is
  untouched. Client code never changes.

## Consequences

- One repo, two backends sharing one core. The next geometry-crash-class fix
  (cf. PRs #9-11) lands in both for free.
- New surface to maintain: a Node server entry and a `'local'` provider branch.
- The local path is unproven on real Pi hardware. Feasibility is gated by
  measured prompt token count, tokens/sec, and JSON-validity rate.

## Validation plan

- **Mac (this work).** Node server boots, `/stream` same-origin, one prompt
  ("draw a red circle") yields >= 1 shape on canvas via a 7-8B Q4 instruct
  model on koboldcpp, no geometry crash in `act()`. Record prompt token count,
  tokens/sec, and JSON-validity rate over ~5 prompts.
- **Pi (handed to Paula Jane).** See `docs/pi-local-model.md`. Reports the same
  metrics on real hardware; that sets the model/ctx ceiling.

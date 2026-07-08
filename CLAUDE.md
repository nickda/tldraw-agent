# tldraw-agent

Fork of [tldraw/agent-template](https://github.com/tldraw/agent-template) with an added local-model backend so the agent can run offline against a local LLM (no cloud account or API keys). React + Cloudflare Workers, plus a Node + Hono backend for the local path. AI agent manipulates a tldraw canvas via chat.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`nickda/tldraw-agent`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` at root + `docs/adr/`. See `docs/agents/domain.md`.

### Latency and performance investigations

Before proposing a fix for a latency/slowness complaint, add or use the existing wall-clock + token-count logging (`[STREAM] finished: reason=... tokens=... elapsedMs=...` in `worker/do/AgentService.ts`) and live-verify current behavior first.

**Why:** on 2026-07-08, an initial fix (capping chat history) was shipped based on plausible code-reading reasoning but didn't move the needle in the actual repro. Only after adding real elapsed-time logging and comparing before/after numbers did it become clear that output-token growth (re-describing/re-checking an already-reviewed scene each round), not input-token growth, was ~90% of the round-over-round slowdown. The fix that actually worked (delta-only review rounds) targeted the opposite side of the equation from the first attempt.

**How to apply:** for any performance complaint in the streaming/agent-request path, get measured before/after numbers (elapsed ms, input/output tokens) live in the browser via the `browse` tool, not just static code inspection, before deciding which term dominates and picking a fix.

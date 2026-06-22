# tldraw-agent

Fork of [tldraw/agent-template](https://github.com/tldraw/agent-template) with an added local-model backend so the agent can run offline against a local LLM (no cloud account or API keys). React + Cloudflare Workers, plus a Node + Hono backend for the local path. AI agent manipulates a tldraw canvas via chat.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`nickda/tldraw-agent`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` at root + `docs/adr/`. See `docs/agents/domain.md`.

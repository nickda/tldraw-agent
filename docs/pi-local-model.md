# Running tldraw-agent on a Raspberry Pi with a local model (koboldcpp)

This runbook is for a tester building and running the **Local backend** on a
Raspberry Pi against a model served by **koboldcpp**, with no Cloudflare account,
no cloud API keys, and no internet dependency at demo time.

Background and rationale: see [ADR-0001](adr/0001-local-model-backend.md) and the
**Backend** entry in [CONTEXT.md](../CONTEXT.md). You do not need that context to
follow this runbook.

## What the Local backend is

A Node server (`server/index.ts`, Hono) that serves the built client and handles
`POST /stream` on the same origin. It reuses the same agent core (`AgentService`,
prompt builders, action schemas, streaming parser) as the Cloudflare backend, so
behaviour matches. Inference points at koboldcpp's OpenAI-compatible
`/v1/chat/completions` endpoint via `LOCAL_MODEL_URL`.

The client is unchanged: it always calls the relative path `/stream`. The server
forces the `local` model regardless of what model the client UI selected.

## Prerequisites

- Raspberry Pi (ARM64 / aarch64), 64-bit OS. 8 GB RAM recommended for a 7-8B
  Q4 model.
- Node.js 20+ (`node --version`).
- A GGUF instruct model file. Suggested baseline: a 7-8B Q4 instruct model
  (e.g. Qwen2.5-7B-Instruct or Llama-3.1-8B-Instruct). Smaller models may not
  produce valid action JSON; see Troubleshooting.

## 1. Build koboldcpp on ARM64

```bash
git clone https://github.com/LostRuins/koboldcpp
cd koboldcpp
make            # CPU build; add LLAMA_* flags if you have a supported accelerator
```

The build produces a `koboldcpp` binary. Place your `.gguf` model file somewhere
readable.

## 2. Launch koboldcpp with a large enough context window

The agent's system prompt embeds the full JSON schema of all active actions,
realistically **6-10k tokens before canvas state**. koboldcpp defaults to a 4k
context, which **silently truncates the prompt** and breaks the agent. You must
set `--contextsize` explicitly.

```bash
./koboldcpp \
  --model /path/to/your-model.Q4_K_M.gguf \
  --contextsize 16384 \
  --port 5001
```

This exposes the OpenAI-compatible API at `http://localhost:5001/v1`.

> If your Pi cannot hold a 16k context for your chosen model, lower
> `--contextsize`, but watch the prompt token count (below). If the system prompt
> does not fit, see the schema-trim escape hatch in Troubleshooting.

## 3. Build the client and run the Node backend

From the repo root on the Pi:

```bash
npm install
npm run build                                   # produces dist/

export LOCAL_MODEL_URL=http://localhost:5001/v1 # match koboldcpp's port
export PORT=8787                                 # the app port
npm start                                        # node/tsx server/index.ts, serves dist/ + /stream
```

Open `http://<pi-host>:8787` in a browser. The Node server serves the built
client and handles `/stream` same-origin.

Environment variables the server reads:

| Var               | Default                      | Meaning                                    |
| ----------------- | ---------------------------- | ------------------------------------------ |
| `LOCAL_MODEL_URL` | `http://localhost:5001/v1`   | koboldcpp OpenAI-compatible base URL       |
| `PORT`            | `8787`                       | Port the app + `/stream` listen on         |

## 4. Pass/fail checklist

Run these in order. Stop and report at the first failure.

- [ ] **Boot.** `npm start` logs `local backend listening on http://localhost:8787`
      and the `LOCAL_MODEL_URL` line. No crash.
- [ ] **Page loads.** The tldraw canvas and chat UI render in the browser.
- [ ] **Stream connects.** Sending a chat prompt opens an SSE stream (no
      immediate `Cannot connect to API` error). If you see that error, koboldcpp
      is not reachable at `LOCAL_MODEL_URL`.
- [ ] **One shape appears.** Prompt: **"draw a red circle"**. At least one shape
      appears on the canvas.
- [ ] **No geometry crash.** The app does not crash in `act()` even if the model
      emits odd coordinates. (The geometry guards from PRs #9-11 apply to this
      backend too.)

## 5. Metrics to report back

Report these so the Pi result is comparable to the Mac baseline:

1. **Model + quantisation** used (e.g. Qwen2.5-7B-Instruct Q4_K_M).
2. **`--contextsize`** you launched koboldcpp with.
3. **Prompt token count** for a representative prompt. koboldcpp logs the prompt
   token count per request in its console output; record it and confirm it is
   below your context size (i.e. the system prompt was not truncated).
4. **Tokens/sec** generation speed (koboldcpp logs this per request).
5. **JSON-validity rate**: over ~5 prompts, how many produced parseable action
   JSON that drew at least one shape vs. how many failed.
6. Any **crashes or stalls**, with the koboldcpp console output around the
   failure.

## Troubleshooting

**`Cannot connect to API` in the stream.** koboldcpp is not running or
`LOCAL_MODEL_URL` is wrong. Confirm `curl http://localhost:5001/v1/models`
returns JSON.

**Model emits malformed action JSON (no shapes, or parse errors).** The known
fix is koboldcpp's **GBNF grammar** sampling, generating a grammar from the
action schema so the model can only emit conforming JSON. This is a documented
fallback, not built in. If you hit this consistently, report it with examples so
the grammar path can be added.

**System prompt does not fit the context window.** The trim point is the JSON
schema section of the system prompt, which is scoped by the active mode's
`actionTypes`. Reducing the number of active actions shrinks the schema and the
prompt. This is a documented escape hatch, not yet implemented; report the
prompt token count so the trim can be scoped.

## What is NOT covered here

- Cloudflare backend (the cloud/demo path) is unchanged; see the main README.
- Performance tuning and final model/context selection are part of your Pi
  validation, not pre-decided here.

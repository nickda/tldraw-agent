# Running tldraw-agent on a Raspberry Pi with a local model

This is a self-contained setup guide for running the agent on a Raspberry Pi 5
against a local model served by **koboldcpp**, with no Cloudflare account, no
cloud API keys, and no internet at demo time.

Everything here was verified on a Mac (Apple Silicon) with the same binary and
model the Pi uses. Pi inference is CPU-only and slower than the Mac's Metal GPU;
expect roughly 2-5 tokens/sec on the Pi versus ~15-20 on the Mac. Plan for a
draw to take tens of seconds to a couple of minutes.

Background and rationale: see [ADR-0001](adr/0001-local-model-backend.md) and the
**Backend** entry in [CONTEXT.md](../CONTEXT.md). You do not need them to follow
this guide.

---

## 1. Hardware and OS

- **Raspberry Pi 5, 16 GB RAM.** 8 GB works for the recommended 7B model but
  leaves little headroom; 16 GB is comfortable and is what this guide assumes.
- **64-bit Raspberry Pi OS** (aarch64 / arm64). Confirm with `uname -m` → must
  print `aarch64`.
- Fast storage. A 7B model is ~4.7 GB; loading from a slow SD card is painful.
  Use an NVMe HAT or a fast USB SSD if you can.
- Active cooling. Sustained CPU inference will thermal-throttle a passively
  cooled Pi, which makes generation even slower.

```bash
uname -m            # expect: aarch64
free -h             # confirm ~16 GB total
nproc               # number of cores (used for --threads below)
```

---

## 2. Dependencies

### 2a. Node.js 20+

The backend server runs on Node via `tsx`. Check / install:

```bash
node --version      # need v20 or newer
# if missing or too old:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2b. Build tools and git (for koboldcpp)

```bash
sudo apt-get update
sudo apt-get install -y git build-essential libopenblas-dev
```

### 2c. The repo and its npm packages

```bash
git clone https://github.com/nickda/tldraw-agent
cd tldraw-agent
npm install
```

This installs everything the local backend needs: `hono`, `@hono/node-server`,
`tsx`, plus the client/build toolchain.

---

## 3. Build koboldcpp on the Pi (ARM64)

There is no prebuilt Linux ARM64 koboldcpp binary, so build from source. (The
Mac uses the prebuilt `koboldcpp-mac-arm64`; the Pi must compile.)

```bash
cd ~
git clone https://github.com/LostRuins/koboldcpp
cd koboldcpp
# CPU build with OpenBLAS for faster prompt processing:
make LLAMA_OPENBLAS=1
```

This produces a `koboldcpp.py` launcher and the compiled libraries. On the Pi
you run koboldcpp with `python3 koboldcpp.py ...` (the Mac uses a single
packaged binary; the build is otherwise equivalent).

> If `make` runs out of memory, add swap or build with fewer jobs:
> `make LLAMA_OPENBLAS=1 -j2`.

---

## 4. Choose and download the model

**Recommended: Qwen2.5-7B-Instruct, Q4_K_M quantization (~4.7 GB).**

This is the model verified for this project. A model bake-off (Qwen2.5-7B,
Qwen2.5-Coder-7B, Qwen3-8B, Qwen2.5-Coder-14B) found that **bigger models did not
draw better** for this task, and the 14B was 2x slower for no quality gain. The
base 7B is the sweet spot, especially on a CPU-only Pi where speed matters.

```bash
cd ~/koboldcpp
curl -L -o Qwen2.5-7B-Instruct-Q4_K_M.gguf \
  'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf?download=true'
```

Verify it downloaded a real model, not an error page:

```bash
ls -lh Qwen2.5-7B-Instruct-Q4_K_M.gguf      # expect ~4.4-4.7 GB
head -c 4 Qwen2.5-7B-Instruct-Q4_K_M.gguf   # expect: GGUF
```

> Do NOT use a vision (VL) model or a "Coder" variant for drawing. Vision models
> tested worse and can't judge layout; the Coder-7B drew more tersely (fewer
> parts) with no quality win. Stick with the plain instruct 7B.

---

## 5. Launch koboldcpp

**The `--contextsize` flag is mandatory.** The agent's system prompt is large
(~8k tokens of action schema before any canvas state). koboldcpp defaults to a
small context and will silently truncate the prompt, breaking the agent. Always
launch with at least 16384.

```bash
cd ~/koboldcpp
python3 koboldcpp.py \
  --model ~/koboldcpp/Qwen2.5-7B-Instruct-Q4_K_M.gguf \
  --contextsize 16384 \
  --threads 4 \
  --port 5001 \
  --skiplauncher
```

- `--threads` ≈ number of performance cores (`nproc` on a Pi 5 reports 4).
- Wait for the line:
  `Starting OpenAI Compatible API on port 5001 at http://localhost:5001/v1/`
- Sanity check from another shell:
  ```bash
  curl -s http://localhost:5001/v1/models
  ```
  It returns a JSON object naming the loaded GGUF. (The agent does NOT require
  this id to match anything; it forces the model server-side.)

Leave koboldcpp running in its own terminal (or as a service, see §8).

---

## 6. Build the client and run the backend

In the repo, in a second terminal:

```bash
cd ~/tldraw-agent
npm run build      # produces dist/client/
LOCAL_MODEL_URL=http://localhost:5001/v1 PORT=8787 npm start
```

- `npm run build` compiles the React client into `dist/client/`.
- `npm start` runs the Node + Hono server (`server/index.ts` via `tsx`). It
  serves the built client and handles `POST /stream` on the same origin,
  proxying inference to koboldcpp.
- Wait for: `tldraw-agent local backend listening on http://localhost:8787`.

Environment variables the server reads:

| Var               | Default                    | Meaning                                   |
| ----------------- | -------------------------- | ----------------------------------------- |
| `LOCAL_MODEL_URL` | `http://localhost:5001/v1` | koboldcpp OpenAI-compatible base URL      |
| `PORT`            | `8787`                     | Port the app and `/stream` listen on      |

The server forces the local model regardless of what the client UI shows, so the
client needs no changes.

---

## 7. Use it

Open `http://<pi-host>:8787` in a browser (on the Pi, or another machine on the
same network).

1. In the bottom-right model dropdown, pick **local**.
2. Type a prompt, e.g. **"draw a snowman"**, and send.
3. The first response is slow: koboldcpp processes the ~8k-token prompt before
   generating. On the Pi this can take a minute or more. Subsequent generation
   is faster than the initial prompt processing.

### What "working" looks like

- Multi-part prompts (snowman, house, car) produce several distinct geometric
  shapes (ellipses, rectangles, triangles), stacked/placed sensibly, not piled
  on one spot.
- White objects render with a visible grey border (they are not invisible on the
  white canvas).
- The app does not crash.

The 7B is not an artist: proportions, colours and feature placement will often be
rough. That is the model ceiling, not a bug. The pipeline (valid output, real
shapes, no crash) is what to verify.

---

## 8. Optional: run as services

For an unattended demo box, run both processes under `systemd` so they start on
boot. Two units, koboldcpp first:

```ini
# /etc/systemd/system/koboldcpp.service
[Unit]
Description=koboldcpp local model
After=network.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/koboldcpp/koboldcpp.py \
  --model /home/pi/koboldcpp/Qwen2.5-7B-Instruct-Q4_K_M.gguf \
  --contextsize 16384 --threads 4 --port 5001 --skiplauncher
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/tldraw-agent.service
[Unit]
Description=tldraw-agent local backend
After=koboldcpp.service
Requires=koboldcpp.service

[Service]
WorkingDirectory=/home/pi/tldraw-agent
Environment=LOCAL_MODEL_URL=http://localhost:5001/v1
Environment=PORT=8787
ExecStart=/usr/bin/npm start
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koboldcpp tldraw-agent
```

Build the client once (`npm run build`) before enabling the services.

---

## 9. Troubleshooting

**`curl http://localhost:5001/v1/models` fails / "Cannot connect to API" in the
app.** koboldcpp isn't running or finished loading. Watch its terminal for the
"Starting OpenAI Compatible API" line.

**The agent draws nothing, or the prompt looks truncated.** You almost certainly
launched koboldcpp without `--contextsize 16384`. The system prompt was cut off.
Relaunch with the flag.

**Build of koboldcpp killed / out of memory.** Add swap (`sudo dphys-swapfile`)
or build with `-j2`.

**Browser shows "Something went wrong / Error loading chat history."** This is
corrupted persisted canvas state in the browser, not a server problem. Click
**Reset data** in the error card, or clear the site's storage (devtools →
Application → clear storage), then reload. (A class of crash that caused this was
fixed in the agent itself; if it still recurs, capture the browser console error
and file an issue.)

**Generation is extremely slow.** Expected on a CPU-only Pi. Confirm active
cooling (thermal throttling roughly halves speed), set `--threads` to the core
count, and keep `--contextsize` no larger than you need (16384 is enough; bigger
wastes KV-cache RAM and time).

**Want to confirm it's the local model, not a cloud one.** There are no cloud API
keys set, and the server forces the `local` model. koboldcpp's terminal logs
every request and its token counts; watch it while you send a prompt.

---

## 10. What NOT to change

- Don't swap in a bigger model expecting better drawings; the bake-off showed it
  doesn't help and costs speed.
- Don't lower `--contextsize` below 16384; the prompt won't fit.
- Don't use a vision/VL or Coder variant for this; plain instruct 7B is the
  verified choice.

# Domain Context: tldraw-agent

## Glossary

### Fairy
A named AI agent presence on the canvas. Represented as an animated SVG sprite that tracks the agent's current drawing location and expresses emotional state. A Fairy is a first-class domain entity — not a generic "cursor" or "indicator." In the single-agent v1, one Fairy corresponds to one TldrawAgent. In the multi-agent 10x vision, each agent has its own named Fairy with distinct personality.

**Canonical names for code:** `Fairy`, `FairyState`, `FairySprite`, `FairyAvatarOverlay`, `useFairyPosition`.

**Avoid:** `AgentCursor`, `AgentPresenceIndicator`, `AgentAvatar` (too generic; loses the personality and multi-agent semantics).

### Fairy Sprite
The Fairy's visual representation. Inline SVG (~40px), styled after the fairies.tldraw.com design: stick-figure body with a round smiley head, two pairs of dragonfly-style wings, arms, and legs. Black outline stroke, white fill body, transparent background. Wings animate via CSS keyframes (flutter). Drawing state mirrors the sprite horizontally (`scaleX(-1)`). Annoyed state triggers a shake keyframe. No emoji — custom SVG paths.

### Fairy Name
A whimsical display name generated fresh each time a Fairy mounts (e.g., "Dick Cindersmith", "Bonnie Kettlewick"). Not derived from the model ID. `generateFairyName()` picks randomly from a curated hardcoded list of ~25 full names. Called once via `useMemo(() => generateFairyName(), [])` inside `FairyAvatarOverlay`. Stable for the lifetime of the component instance. No persistent identity across page reloads or sessions.

`modelNameToFairyName()` is NOT part of the domain — not implemented.

### Fairy-Agent Relationship
A Fairy is a property of a TldrawAgent — 1:1 mapping. The Fairy's position atom (`$fairyPosition`) lives on `AgentRequestManager` inside the agent. `FairyAvatarOverlay` receives the agent as a prop and reads from it directly. Multi-agent v2 instantiates one `FairyAvatarOverlay` per agent.

### FairyState
The emotional/behavioural state of a Fairy. Three values:
- `idle` — agent has an active request but no position-moving action is currently executing. Fairy is visible at its last position, bobbing and wings fluttering. Includes all `think`, `message`, `count`, and other non-spatial actions.
- `drawing` — a position-moving action (`create`, `place`, `pen`, `move`, etc.) is currently executing. Fairy faces away (`scaleX(-1)`).
- `annoyed` — user has held mousedown on the Fairy sprite for >2 seconds. Easter egg.

When the agent has no active request (`$fairyPosition = null`), the Fairy component unmounts entirely. There is no `idle` state for a hidden Fairy.

### Fairy Position
The page-space canvas coordinates `{x: number, y: number}` of the point the Fairy is currently tracking. Stored as a tldraw `Atom` in page-space. Converted to screen-space on read via `editor.pageToScreen()` — never stored in screen-space. This ensures zoom/pan correctness without re-running action extraction.

The atom is `null` only before the Fairy's first action fires (Fairy not yet visible). Once a position is set, it is **never reset to null** — the Fairy stays at its last position when the agent task ends, continuing to bob and flutter wings in `idle` state. The Fairy disappears only on full page reload.

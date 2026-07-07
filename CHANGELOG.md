# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-07-06

### Added

- Team Mode now runs as a fixed hive of three named honeybees: Beeyonce the queen (planner) plus MacBee and WannaBee (executors). Each has its own look and voice instead of a random name on a generic sprite.
- Bees speak on the canvas: each executor shows a short speech bubble above its sprite when it has something to say. MacBee talks in a broad Scottish voice, WannaBee sounds reluctant and distracted. Bubbles fan outward so two adjacent bees never cover each other, and stay up long enough to read.
- WannaBee slacks off: after claiming a drawing task she sometimes pauses for a few seconds (striking a pose, phone out) before getting to work. Beeyonce notices and grumbles about it in her own dry voice.
- New Clear button in the chat panel wipes both the chat history and every shape on the canvas in one go, with a confirmation prompt. The existing "+" still starts a fresh chat without touching the drawing.

### Changed

- The honeybee sprite is a new design: a round striped body with wings and antennae. Beeyonce wears a silver tiara, MacBee's stripes are the blue and white of the Saltire.
- Bees never emit em dashes in anything they say; dashes are converted to commas automatically.

## [0.1.0.2] - 2026-07-05

### Fixed

- Team Mode planner no longer intermittently stalls after planning. The response parser stripped a leading markdown code fence but not a trailing one, so when a model wrapped its output in ```` ```json ... ``` ````, the closing fence made JSON.parse fail and the whole response was dropped, leaving the plan unwritten and the executors idle. The parser now discards any trailing content once the top-level JSON object closes. This mainly affected the Bedrock backend, which gets no assistant prefill and is the most likely to emit fenced output.

## [0.1.0.1] - 2026-05-03

### Fixed

- Fairy now stays next to the drawing during scroll: overlay uses page-space coordinates directly, matching how all other tldraw overlays work. Using `pageToViewport` was double-counting the camera transform and caused the Fairy to move 2× faster than the drawing during pan/scroll.
- Fairy tracks the shape center while drawing: discrete actions (non-streaming `create`) were immediately jumping to the resting offset because `complete: true` fires on the only update. Resting now fires once after all action promises settle.

## [0.1.0.0] - 2026-05-03

### Added

- Fairy overlay: animated SVG sprite that appears on the canvas for each AI agent, showing where the agent is drawing in real time
- Fairy sprite: stick-figure body with dragonfly wings, black outline, animated flutter via CSS keyframes; mirrors horizontally while drawing
- Fairy naming: each Fairy gets a whimsical generated name (e.g. "Bonnie Kettlewick") on mount from a curated list of 25 full names
- Drag support: users can grab and reposition the Fairy; agent position overrides on the next action
- Resting placement: when an action completes, the Fairy steps away from the finished drawing rather than sitting on top of it; offset is zoom-aware so clearance stays consistent across zoom levels
- Multi-agent support: one Fairy per agent, each seeded at a distinct spawn position when the agent is created

### Fixed

- Fairy position now tracks actual shape bounds from the editor diff, not action parameters, so the sprite lands where the shape really is after tldraw resolves constraints
- Fairy stays visible between requests at its last position (idle, wings fluttering) rather than disappearing
- Sprite size stays constant on screen regardless of canvas zoom level
- `zoomLevel=0` guard prevents Infinity being stored as a page-space position
- Drag interaction no longer flips the sprite to drawing state while the user is moving it

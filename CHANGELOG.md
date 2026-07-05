# Changelog

All notable changes to this project will be documented in this file.

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

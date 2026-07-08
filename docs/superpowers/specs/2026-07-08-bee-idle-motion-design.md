# Bee idle motion: design spec

## Problem

Bees look frozen except when actually moving or in a special state. `idle`
already has bob + wing flutter (`client/index.css:174-183`), but:

1. `planning` (Beeyonce composing a plan / reviewing) has no animation at all
   — just a static clipboard pose. She's "at rest, thinking" the same way
   `idle` is, but reads as inert.
2. All three bees run the exact same `bee-bob`/`bee-wing-flutter` keyframes
   with no timing offset, so when multiple bees are idle/planning at once
   (the common case in Team Mode) they flutter and bob in perfect lockstep —
   looks robotic/synchronized rather than like three independent bees.

## Scope

Motion/animation layer only. Not sprite art, not speech bubbles, not new
behavioral states. Two changes:

1. Add `bee-bob` + `bee-wing-flutter` to the `planning` state, matching
   `idle`'s existing treatment.
2. Add a deterministic per-bee `animation-delay` so the three bees desync.

Out of scope: `drawing`, `annoyed`, `slacking` states (each has its own
deliberate motion/stillness already, e.g. slacking's droop, annoyed's shake).
Move/position easing, click feedback, sprite art, and bubble polish are
future phases, not this branch.

## Design

### 1. Planning animation

Mirror the idle selectors, add `planning` to the same rule groups:

```css
.bee-sprite--idle .bee-sprite__figure,
.bee-sprite--planning .bee-sprite__figure {
	animation: bee-bob 1.5s ease-in-out infinite;
}

.bee-sprite--idle .bee-sprite__wing,
.bee-sprite--planning .bee-sprite__wing,
.bee-sprite--drawing .bee-sprite__wing {
	transform-box: fill-box;
	transform-origin: center center;
	animation: bee-wing-flutter 180ms ease-in-out infinite alternate;
}
```

The `PlanningClipboard` accessory (`BeeSprite.tsx`) is unaffected — it's a
static `<g>` inside the same `<svg>`, and the bob/flutter transforms apply
to `__figure`/`__wing`, not the clipboard.

### 2. Per-bee desync

Deterministic, not randomized — must be stable across re-renders and testable.
Add a CSS custom property set from `beeName` in `BeeSprite.tsx`'s inline
style, consumed by the animation-delay in CSS:

```ts
const ANIMATION_DELAY_MS: Record<string, number> = {
	Beeyonce: 0,
	MacBee: -300,
	WannaBee: -600,
}
```

Negative delays start each bee's animation partway through its cycle
immediately on mount (no visible "catch-up" pause), which is the standard
trick for desynced CSS-only loops.

Passed down as `style={{ '--bee-anim-delay': `${delayMs}ms` }}` on the
`.bee-sprite` root, consumed by:

```css
.bee-sprite--idle .bee-sprite__figure,
.bee-sprite--planning .bee-sprite__figure {
	animation: bee-bob 1.5s ease-in-out infinite;
	animation-delay: var(--bee-anim-delay, 0ms);
}

.bee-sprite--idle .bee-sprite__wing,
.bee-sprite--planning .bee-sprite__wing,
.bee-sprite--drawing .bee-sprite__wing {
	animation: bee-wing-flutter 180ms ease-in-out infinite alternate;
	animation-delay: var(--bee-anim-delay, 0ms);
}
```

Any future bee name not in the map defaults to `0ms` (same as Beeyonce) —
acceptable since Team Mode is currently fixed at exactly these three names
(`AgentAppTeamManager.ts`).

## Testing

- Unit test for the delay lookup: `ANIMATION_DELAY_MS` (or an exported
  helper) returns the three fixed values and a `0` default for an unknown
  name.
- Live verification via `browse`: screenshot planning state before/after
  (visual diff of animation is inherently manual — confirm the CSS class is
  applied and computed `animation-name`/`animation-delay` via `$B css`).

## Out of scope / explicitly deferred

- Sprite art changes, new poses beyond the existing 5 states
- Speech bubble visual polish
- Behavioral-event-triggered states (e.g. a "confused" pose during delegateFix)
- Move/position easing changes
- Click/drag interaction feedback beyond the existing annoyed-on-hold

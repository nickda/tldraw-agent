# Bee idle motion: implementation plan

Spec: `docs/superpowers/specs/2026-07-08-bee-idle-motion-design.md`

## Global constraints

- Desync delays are deterministic (fixed map), never `Math.random()`.
- `planning` gets the exact same `bee-bob`/`bee-wing-flutter` animations as
  `idle` — do not invent new keyframes.
- The `--bee-anim-delay` CSS var goes on the `.bee-sprite` root element
  (`client/components/BeeSprite.tsx:20-22`), which already has an inline
  `style={{ pointerEvents: 'none' }}` — merge into that object, don't add a
  second style prop.
- Unknown bee names default to `0ms` delay (same as Beeyonce).

## Task 1: Add planning to the idle animation selectors

File: `client/index.css`

Change:

```css
.bee-sprite--idle .bee-sprite__figure {
	animation: bee-bob 1.5s ease-in-out infinite;
}

.bee-sprite--idle .bee-sprite__wing,
.bee-sprite--drawing .bee-sprite__wing {
	transform-box: fill-box;
	transform-origin: center center;
	animation: bee-wing-flutter 180ms ease-in-out infinite alternate;
}
```

To:

```css
.bee-sprite--idle .bee-sprite__figure,
.bee-sprite--planning .bee-sprite__figure {
	animation: bee-bob 1.5s ease-in-out infinite;
	animation-delay: var(--bee-anim-delay, 0ms);
}

.bee-sprite--idle .bee-sprite__wing,
.bee-sprite--planning .bee-sprite__wing,
.bee-sprite--drawing .bee-sprite__wing {
	transform-box: fill-box;
	transform-origin: center center;
	animation: bee-wing-flutter 180ms ease-in-out infinite alternate;
	animation-delay: var(--bee-anim-delay, 0ms);
}
```

Note `bee-shake` (annoyed) and `slacking-wobble` (slacking) are untouched —
no `animation-delay` added there, since those states are single-bee-at-a-time
in practice and out of scope per the spec.

## Task 2: Per-bee animation delay map + wiring

File: `client/components/BeeSprite.tsx`

Add near the top of the file (after the `BeeState` import):

```ts
/**
 * Deterministic per-bee offset so idle/planning bob and wing-flutter don't
 * run in lockstep across all three bees. Negative delays start each bee
 * partway through its cycle immediately on mount, avoiding a visible
 * catch-up pause. Any bee name not listed here defaults to 0ms.
 */
const BEE_ANIMATION_DELAY_MS: Record<string, number> = {
	Beeyonce: 0,
	MacBee: -300,
	WannaBee: -600,
}

export function getBeeAnimationDelayMs(beeName: string): number {
	return BEE_ANIMATION_DELAY_MS[beeName] ?? 0
}
```

In the `BeeSprite` component, change the root `<div>`'s style to include the
CSS var:

```tsx
<div
	className={rootClassName}
	data-bee-state={state}
	style={{
		pointerEvents: 'none',
		'--bee-anim-delay': `${getBeeAnimationDelayMs(beeName)}ms`,
	} as React.CSSProperties}
>
```

(The `as React.CSSProperties` cast is needed because custom properties
aren't in the standard style typing — same pattern used elsewhere in this
codebase for CSS vars if one exists; otherwise this is the first, which is
fine.)

## Task 3: Unit test for the delay map

File: `client/components/BeeSprite.test.ts` (new)

```ts
import { describe, expect, test } from 'bun:test'
import { getBeeAnimationDelayMs } from './BeeSprite'

describe('getBeeAnimationDelayMs', () => {
	test('returns the fixed delay for each known bee', () => {
		expect(getBeeAnimationDelayMs('Beeyonce')).toBe(0)
		expect(getBeeAnimationDelayMs('MacBee')).toBe(-300)
		expect(getBeeAnimationDelayMs('WannaBee')).toBe(-600)
	})

	test('defaults to 0 for an unknown bee name', () => {
		expect(getBeeAnimationDelayMs('SomeFutureBee')).toBe(0)
	})
})
```

## Task 4: Live verification

Not a subagent task — done by the controller after Tasks 1-3 land:

1. Start dev server, open Team Mode, submit a prompt that puts Beeyonce in
   `planning` and leaves executors `idle` simultaneously (e.g. a multi-item
   drawing task, screenshot mid-plan).
2. `$B css .bee-sprite--planning .bee-sprite__figure animation-name` and
   `animation-delay` on all three bee elements — confirm non-zero distinct
   delays and the bob animation is actually applied to planning.
3. Screenshot for visual sanity (bees should look like they're mid-cycle at
   different points, not frozen or perfectly synced — acknowledge this part
   is a manual visual read, not an assertion).

## Self-review: spec coverage

- Planning gets bob + flutter: Task 1. ✓
- Deterministic per-bee desync, no `Math.random()`: Task 2. ✓
- Unknown bee defaults to 0ms: Task 2 (`?? 0`) + Task 3 test. ✓
- drawing/annoyed/slacking untouched: Task 1 explicitly leaves those rules
  alone. ✓
- Out-of-scope items (sprite art, bubbles, behavioral states, move easing,
  click feedback): not touched by any task. ✓

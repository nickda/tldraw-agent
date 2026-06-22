# Design: defect-targeted drawing-quality fixes (#3 invisible white, #1 size order)

- Status: Approved
- Date: 2026-06-22

## Context

The local backend (koboldcpp + Qwen2.5-7B) now draws multi-part shapes that are
correctly placed (relative-placement work) and no longer crash (draw-shape
geometry fix). The remaining gap is attribute correctness, not layout. A test
"draw a snowman" produced parts that were placed and stacked correctly but:

3. white snowballs were invisible (solid white on the white canvas), and
1. sizes were inverted (largest ball on top instead of bottom).

We are NOT chasing general "quality". We target these two named, reproducible
defects. Two further defects are explicitly deferred (see Out of Scope).

## Decisions

The two defects need different mechanisms because they differ in whether code
can safely enforce them:

- **#3 (invisible white) is a hard invariant.** An invisible shape is never
  intended, so code can rewrite it deterministically. Same reasoning as the
  draw-shape crash fix: when the rule is unambiguous, enforce it in code rather
  than trusting the 7B to follow prose it already ignored (the existing
  white-shape prompt rule was present and skipped).
- **#1 (size order) is intent-dependent.** "Higher = smaller" is true for a
  snowman, tree, or tower, but false for a lollipop, mushroom, or tree-on-trunk.
  Code cannot know which without modelling intent, so this stays a prompt nudge
  and the model decides.

## Fix #3 — invisible white shapes (code)

**Location:** `client/actions/CreateActionUtil.ts`, in `sanitizeAction` (which
already mutates the incoming `shape`).

**Rule:** when a created shape has `color === 'white'` AND
`fill ∈ {'solid', 'none', 'tint'}` AND `_type !== 'text'`, rewrite it to
`fill: 'background'`, `color: 'grey'`.

- `fill: 'background'` renders as the canvas background colour, and `grey`
  gives a visible border, so a white object (snow, cloud, ghost) reads against
  the white canvas. This matches the existing (ignored) prompt guidance.
- Skip `fill: 'background'` already set (already correct).
- Skip `text` shapes: white text is often intentional on a dark fill.

Fill vocabulary is `FocusedFillSchema = ['none','tint','background','solid','pattern']`
(`shared/format/FocusedFill.ts`). Colour `white` is a member of the focused
colour enum.

**Why narrow (only solid/none/tint, only non-text):** avoids over-rewriting
legitimate white shapes (white text, shapes already using `background`). The
trigger is scoped exactly to the invisible-on-canvas case.

## Fix #1 — size order (prompt)

**Location:** `worker/prompt/sections/rules-section.ts`, the existing
create-then-`place` snowman example plus one rule line.

- Make the snowman example's sizes explicit: base ellipse largest, middle
  smaller, head smallest, so the model has a concrete tapering pattern.
- Add a rule: when stacking parts that should taper (snowman, tree, tower),
  each higher shape's `w`/`h` should be smaller than the shape below it.

The example already shows base→head placement; this adds the size relationship
the model failed to generalise.

## Out of Scope (deferred, named)

- **#2 wrong colour** (e.g. a black snowman) — taste-dependent; harder; not a
  visibility invariant.
- **#4 scattered features / #5 misplaced hat** — require placing small features
  on a specific parent part; likely at or beyond the 7B ceiling.
- No size-inversion lint: "big shape on top" is valid for many drawings, so
  deterministic detection would false-flag.

## Testing

- **#3:** unit test the sanitize rewrite — given a white solid geo shape, assert
  it becomes `fill: 'background', color: 'grey'`; given white text or an already
  `background` shape, assert unchanged. `bun:test`, pure object mutation.
- **#1:** not unit-testable (prompt). Verify on the Mac pass.
- **Manual Mac pass:** draw a snowman 2-3×. White parts visible (grey border);
  sizes taper bottom→top; no crash. Accept residual 7B inconsistency.

## Risks

- White-sanitize over-rewrite → bounded by the text + fill-value guards.
- Size rule ignored by the 7B (it ignored size before) → measure, do not
  over-invest; this is a nudge, not a guarantee.

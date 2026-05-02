# TODOS

Items deferred from reviews. Each item has a concrete description, motivation, and effort estimate.

---

## Fairy Avatar Feature (from /plan-ceo-review 2026-05-02)

### P1 — store.listen crash guard
**What:** Wrap the `store.listen` callback body in try/catch to prevent uncaught exceptions propagating to React's error boundary.
**Why:** An uncaught error inside the store listener will crash the overlay. No error boundary exists at this level in App.tsx.
**Where to add:** Inside `useFairyPosition`, the `store.listen` callback.
**Effort:** S (human ~15 min / CC ~2 min)

### P1 — RAF stale closure cleanup
**What:** Add `isMounted` ref or ensure `useEffect` cleanup cancels the pending `requestAnimationFrame` handle before component unmounts.
**Why:** RAF callback calls `setState` after unmount — React warns, position may ghost. Common React footgun.
**Where to add:** `useFairyPosition` useEffect cleanup.
**Effort:** S (human ~10 min / CC ~2 min)

### P2 — Annoyed timer clears on window blur
**What:** `window.addEventListener('blur', clearTimer)` in the annoyed state handler so the 2s timer cancels if the user alt-tabs mid-hold.
**Why:** Without this, the fairy becomes annoyed when the user returns after an accidental alt-tab, with no active gesture.
**Where to add:** `FairySprite` mousedown handler.
**Effort:** S (human ~5 min / CC ~1 min)

### P2 — aria-hidden on overlay root
**What:** Add `aria-hidden="true"` to the `FairyAvatarOverlay` root div.
**Why:** The fairy is decorative. Screen readers should not announce it.
**Where to add:** `FairyAvatarOverlay` root element.
**Effort:** S (1 attribute)

### P2 — Name label overflow protection
**What:** Add `max-width: 80px; overflow: hidden; text-overflow: ellipsis` to the fairy name `<span>`.
**Why:** Long model names (e.g., vendor-specific IDs) would extend off the screen edge.
**Where to add:** Name label CSS in `index.css` or inline style.
**Effort:** S (1 CSS rule)

### P3 — Fairy position viewport constraints (mobile)
**What:** Clamp `left`/`top` to stay within canvas safe area so the fairy doesn't overlap the toolbar on small screens.
**Why:** At 100% zoom on a small screen, the fairy can slide under the bottom toolbar.
**Where to add:** `useFairyPosition` return value clamping, or `FairyAvatarOverlay` positioning logic.
**Effort:** M (human ~1h / CC ~10 min)

---

## Deferred Feature Expansions

### Fairy thought bubble
Show a `...` speech bubble above the fairy during `think` actions. Deferred from cherry-pick ceremony — too cluttered for v1. Add if demos need more visual feedback during long think phases.

### Fairy sparkle trail
Particles at previous position on relocation. Deferred — clean v1 preferred. Add if demo wow-factor needs more visual.

### Multi-agent (3 fairies)
Three named fairy agents with task assignment and orchestration. This is the full fairies.tldraw.com vision. Requires: multiple TldrawAgent instances, DO per agent, orchestrator pattern. See CEO plan vision section.

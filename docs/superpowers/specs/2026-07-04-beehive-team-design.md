# Beehive Team: rename Team Mode fairies to honeybees

Branch: `feat/beehive-team`

## Summary

Team Mode currently spawns agents styled as generic "fairies" with random
comedic names from a 25-entry pool (`Sniper's Dream`, `Chairman Meow`, etc).
This rename replaces the fairy identity with a fixed honeybee team of three
named, differently-tempered bees, and gives two of them small behavioral
quirks tied to their name.

Team Mode always runs exactly 1 planner + 2 executors (confirmed fixed, not
variable). The fixed team size is what makes hardcoded name assignment
viable — no name pool/exclusion logic is needed for Team Mode.

## Fixed team assignment

| Role | Name | Personality |
|---|---|---|
| Planner | **Beeyonce** | Queen bee. Leadership voice. |
| Executor 0 | **MacBee** | Highland provocateur — Scottish-inflected chat voice. |
| Executor 1 | **WannaBee** | Slacker — periodically pauses mid-task. |

Assignment is positional and hardcoded in `AgentAppTeamManager.ts`: the
planner is always Beeyonce, the first executor created is always MacBee, the
second is always WannaBee. `generateFairyName()`'s random-pool mechanism is
**not used for Team Mode** — it stays only for Solo Mode (see below).

## Solo Mode (unchanged naming, new visuals)

Solo Mode (`role: 'solo'`, single agent, no team) keeps calling
`generateFairyName()` against the existing 25-name joke pool unchanged
(`Chairman Meow`, `Sgt. Biscuits`, etc). This is an intentional, accepted
mismatch: a solo agent will render with the new bee sprite but keep an old
fairy-style name. `generateFairyName.ts` is untouched.

## Sprite design

Two body styles, chosen per-bee:

- **Style A — round bumble body**: single oval body, thick yellow/black
  stripes, small antennae. Used by **Beeyonce** and **WannaBee**.
- **Style B — head + segmented abdomen**: distinct round head atop a tapered
  striped abdomen, more anatomically bee-like. Used by **MacBee**, with
  stripes recolored to **white/blue (St Andrew's Saltire)** instead of
  yellow/black.

Both styles replace the current wand-figure-with-wizard-hat SVG in
`FairySprite.tsx` (renamed `BeeSprite.tsx`). Wings, antennae, and the general
proportions carry over conceptually but the body/hat markup is rewritten.

### Special markers

- **Beeyonce**: gold crown (replacing the wizard hat polygon) **plus** a
  diagonal sash across the body. Both combined, not either/or.
- **WannaBee**: gets a dedicated new pose for her slacking state — phone-check
  arm raised, dramatic diva arm flung out, and a duck-lips mouth detail. All
  three combined into one pose, not alternated.
- **MacBee**: no new pose. Personality is voice/chat-text only (see below) —
  reuses the existing front/drawing/planning poses, just with the Style B body
  and Saltire coloring.

## WannaBee slacking mechanic

New `FairyState` value: `'slacking'` (existing states:
`'idle' | 'drawing' | 'planning' | 'annoyed'`).

- **Trigger**: name-gated — only fires when `fairyName === 'WannaBee'`. Not a
  general executor mechanic; MacBee and any future executor never slack.
- **Chance**: each time WannaBee claims a plan item (via `claimItem`), 25%
  chance she enters `'slacking'` before starting to draw.
- **Duration**: real pause of 2-4 seconds (randomized within range) — not
  purely cosmetic. The executor's draw dispatch genuinely waits before the
  first draw action is issued, wired into the existing claim/draw flow that
  currently lives across `AgentModeChart.ts` executor mode and
  `DispatchExecutorsActionUtil.ts`.
- **Visual**: sprite renders the new slacking pose (phone/diva/duck-lips)
  for the pause duration, then transitions to the normal `'drawing'` pose and
  proceeds exactly as before.

No new detection/event wiring is added beyond this — the pause is local to
WannaBee's own claim handling, not observed or reacted to programmatically by
anyone else.

## Beeyonce's reaction to slacking

No code-level detection of WannaBee's `'slacking'` state by the planner.
Instead, the planner's system prompt (currently built in `ChatPanel.tsx`) gets
an added instruction: react with mild exasperation/grumbling if an executor
named WannaBee appears to be slacking, as part of its existing narration
voice. This is prompt-only — the model handles it narratively through the
existing chat flow, no new manager code.

## MacBee's voice

Flavor only, no new mechanic or state. MacBee's chat narration (claiming
items, brief status lines) is written/prompted with a Scottish-inflected,
provocative tone. This is a prompt/voice change, not new sprite or dispatch
logic — same scope decision as Beeyonce/WannaBee's chat lines, just applied
to MacBee's baseline personality instead of a one-off reaction.

## Rename scope (mechanical)

Full identifier rename across the fairy→bee surface. Renamed:

- `client/types/FairyState.ts` → `BeeState.ts` (adds `'slacking'`)
- `client/components/FairySprite.tsx` → `BeeSprite.tsx` (new SVG geometry per above)
- `client/components/FairyReticle.tsx` → `BeeReticle.tsx`
- `client/components/FairyAvatarOverlay.tsx` → `BeeAvatarOverlay.tsx` (+ `.test.tsx`)
- `client/hooks/useFairyPosition.ts` → `useBeePosition.ts`
- `client/utils/fairyPosition.ts` → `beePosition.ts` (+ `.test.ts`)
- CSS: `.fairy-sprite*` classes and `fairy-bob`/`fairy-wing-flutter`/`fairy-shake`
  keyframes in `client/index.css` → `.bee-sprite*` / `bee-bob` / `bee-wing-flutter`
  / `bee-shake`, plus a new keyframe for the slacking pose.
- Properties/fields renamed throughout: `fairyName`→`beeName`, `fairyColor`→
  `beeColor`, `fairyPosition`→`beePosition`, `setFairyPosition`/
  `getFairyPosition`→`setBeePosition`/`getBeePosition`,
  `DEFAULT_FAIRY_COLOR`→`DEFAULT_BEE_COLOR`,
  `getDefaultFairySpawnPosition`/`getTeamFairySpawnPosition`→
  `getDefaultBeeSpawnPosition`/`getTeamBeeSpawnPosition`.
- Touches (rename + minor prompt text updates): `client/agent/TldrawAgent.ts`,
  `client/agent/managers/AgentRequestManager.ts`,
  `client/agent/managers/AgentAppAgentsManager.ts`,
  `client/agent/managers/AgentAppTeamManager.ts` (hardcoded assignment +
  planner prompt grumble line lives here or `ChatPanel.tsx`, whichever
  currently owns the planner system prompt string),
  `client/agent/managers/sharedPlan.ts` (comment only),
  `client/components/TeamRoster.tsx`, `client/components/ChatPanel.tsx`,
  `client/components/highlights/AgentViewportBoundsHighlights.tsx`,
  `client/actions/DispatchExecutorsActionUtil.ts`,
  `client/modes/AgentModeChart.ts`, `shared/schema/AgentActionSchemas.ts`
  (description string), `client/App.tsx`.
- **Not renamed**: `client/utils/generateFairyName.ts` and its test — stays as
  the solo-mode-only fairy name pool, intentionally.

## Out of scope

- The executor-draw-reliability debugging work (6 files, previously
  uncommitted) has been committed separately on `main` as
  `a0be982 debug: add executor draw logging and prompt tuning attempts`.
  `feat/beehive-team` is rebased on top of that commit, so this branch starts
  from a clean baseline — no mixing of the two concerns. That debug work is
  still unverified (root cause not confirmed); it will need its own follow-up
  investigation session, tracked separately from this rename.
- No behavior/state changes for MacBee beyond voice/sprite recolor.
- No general "any executor can slack" mechanic — WannaBee-only.
- No new solo-mode bee name — old fairy names stay for solo, accepted mismatch.

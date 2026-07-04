# Beehive Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Team Mode's "fairy" identity to a fixed honeybee team (Beeyonce/MacBee/WannaBee), redesign the sprite, and add WannaBee's slacking mechanic.

**Architecture:** Mechanical rename of the `Fairy*` identifier surface to `Bee*` (types, components, hooks, CSS), then layer in three behavior changes on top: hardcoded name/role assignment in Team Mode, new bee SVG geometry per bee, and a new `slacking` state gated to WannaBee.

**Tech Stack:** React + TypeScript, tldraw SDK (`EditorAtom`, `atom`), Vite, `bun test` (not vitest/jest — confirmed via package.json and a live test run).

## Global Constraints

- Solo Mode (`role: 'solo'`) keeps `generateFairyName()` and the 25-name joke pool untouched — spec explicitly accepts the name/sprite mismatch.
- Team Mode is always exactly 1 planner + 2 executors — no name-pool logic needed there, only hardcoded assignment.
- Test runner is `bun test`, run via `bun test <path>`. Type check via `bunx tsc --noEmit -p tsconfig.json`.
- Every renamed file keeps its existing test file renamed alongside it (same coverage, updated imports/strings).
- No behavior changes beyond what's in the spec: MacBee is voice/color/sprite-body only, no new state or pose.

---

### Task 1: Rename `FairyState` → `BeeState`, add `'slacking'`

**Files:**
- Create: `client/types/BeeState.ts`
- Delete: `client/types/FairyState.ts`

**Interfaces:**
- Produces: `export type BeeState = 'idle' | 'drawing' | 'planning' | 'annoyed' | 'slacking'`

- [ ] **Step 1: Create the new type file**

```ts
// client/types/BeeState.ts
export type BeeState = 'idle' | 'drawing' | 'planning' | 'annoyed' | 'slacking'
```

- [ ] **Step 2: Delete the old file**

```bash
rm client/types/FairyState.ts
```

- [ ] **Step 3: Find every remaining reference to the old path/name**

Run: `grep -rn "FairyState" client/ shared/ --include="*.ts" --include="*.tsx"`
Expected: two hits, both in `client/components/FairyAvatarOverlay.tsx` (handled in Task 6).

- [ ] **Step 4: Commit**

```bash
git add client/types/BeeState.ts
git rm client/types/FairyState.ts
git commit -m "rename: FairyState -> BeeState, add slacking"
```

---

### Task 2: Rename `fairyPosition.ts` → `beePosition.ts` (+ test)

**Files:**
- Create: `client/utils/beePosition.ts`
- Create: `client/utils/beePosition.test.ts`
- Delete: `client/utils/fairyPosition.ts`
- Delete: `client/utils/fairyPosition.test.ts`

**Interfaces:**
- Produces: `BeePosition` (type, was `FairyPosition`), `getDefaultBeeSpawnPosition(viewportBounds, index?)`, `getTeamBeeSpawnPosition(viewportBounds, roleIndex)`, `extractBeePositionFromDiff(diff, getShapePageBounds, options?)`, `getBeePositionFromBounds(bounds, placement, zoomLevel?)`, `extractBeePosition(action, normalize?)`.
- Consumes: `FocusedShape` from `shared/format/FocusedShape`, `AgentAction` from `shared/types/AgentAction`, `Streaming` from `shared/types/Streaming` (unchanged imports).

- [ ] **Step 1: Create `client/utils/beePosition.ts` with all names renamed**

```ts
import { FocusedShape } from '../../shared/format/FocusedShape'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'

export type BeePosition = { x: number; y: number }
type BoundsLike = { x: number; y: number; w: number; h: number }
type ShapeRecordLike = { id: string; typeName: string }
type ShapeDiffLike = {
	added: Record<string, ShapeRecordLike>
	updated: Record<string, [ShapeRecordLike, ShapeRecordLike]>
}
type BeeBoundsPlacement = 'center' | 'resting'

const BEE_RESTING_OFFSET_SCREEN_PX = 48

export function getDefaultBeeSpawnPosition(
	viewportBounds: {
		x: number
		y: number
		w: number
		h: number
	},
	index = 0
): BeePosition {
	const center = {
		x: viewportBounds.x + viewportBounds.w / 2,
		y: viewportBounds.y + viewportBounds.h / 2,
	}

	if (index === 0) {
		return center
	}

	const spawnIndex = index - 1
	const radius = 80 + Math.floor(spawnIndex / 4) * 48
	const angle = (spawnIndex % 4) * (Math.PI / 2)

	return {
		x: center.x + Math.cos(angle) * radius,
		y: center.y + Math.sin(angle) * radius,
	}
}

const TEAM_FORMATION_OFFSET = 120

export function getTeamBeeSpawnPosition(
	viewportBounds: { x: number; y: number; w: number; h: number },
	roleIndex: number
): BeePosition {
	const center = {
		x: viewportBounds.x + viewportBounds.w / 2,
		y: viewportBounds.y + viewportBounds.h / 2,
	}

	switch (roleIndex) {
		case 0: return center
		case 1: return { x: center.x - TEAM_FORMATION_OFFSET, y: center.y }
		case 2: return { x: center.x + TEAM_FORMATION_OFFSET, y: center.y }
		default: return center
	}
}

export function extractBeePositionFromDiff(
	diff: ShapeDiffLike,
	getShapePageBounds: (shapeId: string) => BoundsLike | null | undefined,
	options: { placement?: BeeBoundsPlacement; zoomLevel?: number } = {}
): BeePosition | null {
	const changedShapeIds = [
		...Object.values(diff.added)
			.filter((record) => record.typeName === 'shape')
			.map((record) => record.id),
		...Object.values(diff.updated)
			.map(([, record]) => record)
			.filter((record) => record.typeName === 'shape')
			.map((record) => record.id),
	]

	const shapeId = changedShapeIds.at(-1)
	if (!shapeId) return null

	const bounds = getShapePageBounds(shapeId)
	if (!bounds) return null

	return getBeePositionFromBounds(bounds, options.placement ?? 'center', options.zoomLevel)
}

export function getBeePositionFromBounds(
	bounds: BoundsLike,
	placement: BeeBoundsPlacement,
	zoomLevel = 1
): BeePosition {
	if (placement === 'resting') {
		const pageOffset = BEE_RESTING_OFFSET_SCREEN_PX / (zoomLevel > 0 ? zoomLevel : 1)
		return {
			x: bounds.x + bounds.w + pageOffset,
			y: bounds.y + bounds.h + pageOffset,
		}
	}

	return {
		x: bounds.x + bounds.w / 2,
		y: bounds.y + bounds.h / 2,
	}
}

export function extractBeePosition(
	action: Streaming<AgentAction>,
	normalize?: (position: BeePosition) => BeePosition
): BeePosition | null {
	let position: BeePosition | null

	switch (action._type) {
		case 'create':
			position = action.shape ? getFocusedShapeCentroid(action.shape) : null
			break
		case 'move':
			position = hasNumberPair(action.x, action.y)
				? { x: action.x as number, y: action.y as number }
				: null
			break
		case 'pen':
			position = getPointsBoundsCenter(action.points)
			break
		default:
			position = null
	}

	return position && normalize ? normalize(position) : position
}

function getFocusedShapeCentroid(shape: Partial<FocusedShape>): BeePosition | null {
	switch (shape._type) {
		case 'arrow':
		case 'line':
			return hasNumberQuad(shape.x1, shape.y1, shape.x2, shape.y2)
				? { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 }
				: null
		case 'draw':
			return null
		case 'note':
		case 'text':
		case 'unknown':
			return hasNumberPair(shape.x, shape.y) ? { x: shape.x as number, y: shape.y as number } : null
		default:
			return hasBox(shape.x, shape.y, shape.w, shape.h)
				? { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
				: null
	}
}

function getPointsBoundsCenter(points: Array<{ x: number; y: number }> | undefined): BeePosition | null {
	if (!points || points.length === 0) return null

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const point of points) {
		if (!hasNumberPair(point.x, point.y)) continue
		minX = Math.min(minX, point.x)
		minY = Math.min(minY, point.y)
		maxX = Math.max(maxX, point.x)
		maxY = Math.max(maxY, point.y)
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
		return null
	}

	return {
		x: minX + (maxX - minX) / 2,
		y: minY + (maxY - minY) / 2,
	}
}

function hasNumberPair(x: unknown, y: unknown): boolean {
	return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
}

function hasNumberQuad(a: unknown, b: unknown, c: unknown, d: unknown): boolean {
	return hasNumberPair(a, b) && hasNumberPair(c, d)
}

function hasBox(x: unknown, y: unknown, w: unknown, h: unknown): boolean {
	return (
		typeof x === 'number' &&
		Number.isFinite(x) &&
		typeof y === 'number' &&
		Number.isFinite(y) &&
		typeof w === 'number' &&
		Number.isFinite(w) &&
		typeof h === 'number' &&
		Number.isFinite(h)
	)
}
```

- [ ] **Step 2: Create `client/utils/beePosition.test.ts` — copy of the old test file with every `Fairy`→`Bee` identifier renamed**

```bash
cp client/utils/fairyPosition.test.ts client/utils/beePosition.test.ts
sed -i '' \
  -e "s/extractFairyPosition/extractBeePosition/g" \
  -e "s/extractFairyPositionFromDiff/extractBeePositionFromDiff/g" \
  -e "s/getDefaultFairySpawnPosition/getDefaultBeeSpawnPosition/g" \
  -e "s/getFairyPositionFromBounds/getBeePositionFromBounds/g" \
  -e "s#\./fairyPosition#./beePosition#g" \
  client/utils/beePosition.test.ts
```

- [ ] **Step 3: Delete the old files**

```bash
rm client/utils/fairyPosition.ts client/utils/fairyPosition.test.ts
```

- [ ] **Step 4: Run the new test**

Run: `bun test client/utils/beePosition.test.ts`
Expected: `26 pass`, `0 fail` (same count as the original 26 assertions across the file's describe blocks — verify count matches what `fairyPosition.test.ts` produced before deletion by checking `bun test client/utils/fairyPosition.test.ts` output in Step 0 if in doubt; the file has 4 describe blocks with the tests shown above).

- [ ] **Step 5: Commit**

```bash
git add client/utils/beePosition.ts client/utils/beePosition.test.ts
git rm client/utils/fairyPosition.ts client/utils/fairyPosition.test.ts
git commit -m "rename: fairyPosition -> beePosition"
```

---

### Task 3: Rename `AgentRequestManager`'s position field + `TldrawAgent`'s name/color fields

**Files:**
- Modify: `client/agent/managers/AgentRequestManager.ts:30-33,153-163` (field + method rename)
- Modify: `client/agent/TldrawAgent.ts` (multiple locations: import, `DEFAULT_FAIRY_COLOR`, `fairyName`/`fairyColor` fields, constructor, `serializeState`/`loadState`, error message string, `extractFairyPosition*`/`getFairyPositionFromBounds` call sites)

**Interfaces:**
- Consumes: `BeePosition` type + `getBeePositionFromBounds`/`extractBeePosition`/`extractBeePositionFromDiff` from Task 2 (`client/utils/beePosition.ts`).
- Produces: `AgentRequestManager.setBeePosition(position)`, `AgentRequestManager.getBeePosition()`. `TldrawAgent.beeName: string`, `TldrawAgent.beeColor: string`, `export const DEFAULT_BEE_COLOR = '#111'`. `PersistedAgentState.beeName?`, `PersistedAgentState.beeColor?`. `TldrawAgentOptions.beeName?`, `TldrawAgentOptions.beeColor?`.

- [ ] **Step 1: Rename the position field/methods in `AgentRequestManager.ts`**

Change lines 30-33 from:
```ts
	/**
	 * The Fairy's last known page-space position.
	 * Null until the Fairy first appears.
	 */
	private $fairyPosition: Atom<{ x: number; y: number } | null>
```
to:
```ts
	/**
	 * The Bee's last known page-space position.
	 * Null until the Bee first appears.
	 */
	private $beePosition: Atom<{ x: number; y: number } | null>
```

Change the constructor line `this.$fairyPosition = atom('fairyPosition', null)` to `this.$beePosition = atom('beePosition', null)`.

Change lines 153-163 from:
```ts
	/**
	 * Set the Fairy's last known page-space position.
	 */
	setFairyPosition(position: { x: number; y: number } | null) {
		this.$fairyPosition.set(position)
	}

	/**
	 * Get the Fairy's last known page-space position.
	 */
	getFairyPosition() {
		return this.$fairyPosition.get()
	}
```
to:
```ts
	/**
	 * Set the Bee's last known page-space position.
	 */
	setBeePosition(position: { x: number; y: number } | null) {
		this.$beePosition.set(position)
	}

	/**
	 * Get the Bee's last known page-space position.
	 */
	getBeePosition() {
		return this.$beePosition.get()
	}
```

- [ ] **Step 2: Update `TldrawAgent.ts` imports**

Change:
```ts
import { extractFairyPosition, extractFairyPositionFromDiff, getFairyPositionFromBounds } from '../utils/fairyPosition'
import { generateFairyName } from '../utils/generateFairyName'
```
to:
```ts
import { extractBeePosition, extractBeePositionFromDiff, getBeePositionFromBounds } from '../utils/beePosition'
import { generateFairyName } from '../utils/generateFairyName'
```

(`generateFairyName` import is unchanged per spec — Solo Mode keeps it.)

- [ ] **Step 3: Rename the color constant and doc comment**

Change:
```ts
/**
 * The role a Fairy plays in a Team Mode run.
 * - `planner`: decomposes the request into the Shared Plan and reviews (one).
 * - `executor`: claims and draws Plan Items (two).
 * - `solo`: the single-agent path, behaving exactly as before Team Mode.
 *
 * The role is a stable property of the agent, distinct from its (ephemeral)
 * mode and its cosmetic Fairy name. It is persisted so the team is stable
 * across reloads.
 */
export type AgentRole = 'planner' | 'executor' | 'solo'

/**
 * The default Fairy sprite colour, matching the pre-Team-Mode look. Used by the
 * solo agent so the single-agent path is visually unchanged.
 */
export const DEFAULT_FAIRY_COLOR = '#111'
```
to:
```ts
/**
 * The role a Bee plays in a Team Mode run.
 * - `planner`: decomposes the request into the Shared Plan and reviews (one).
 * - `executor`: claims and draws Plan Items (two).
 * - `solo`: the single-agent path, behaving exactly as before Team Mode.
 *
 * The role is a stable property of the agent, distinct from its (ephemeral)
 * mode and its cosmetic Bee name. It is persisted so the team is stable
 * across reloads.
 */
export type AgentRole = 'planner' | 'executor' | 'solo'

/**
 * The default Bee sprite colour, matching the pre-Team-Mode look. Used by the
 * solo agent so the single-agent path is visually unchanged.
 */
export const DEFAULT_BEE_COLOR = '#111'
```

- [ ] **Step 4: Rename `PersistedAgentState` and `TldrawAgentOptions` fields**

Change:
```ts
	/** The agent's whimsical Fairy name. Persisted so names are stable across reloads. */
	fairyName?: string
	/** The agent's Fairy sprite colour. Persisted so looks are stable across reloads. */
	fairyColor?: string
}

export interface TldrawAgentOptions {
	/** The editor to associate the agent with. */
	editor: Editor
	/** A key used to differentiate the agent from other agents. */
	id: string
	/** A callback for when an error occurs. */
	onError: (e: any) => void
	/** The agent's Team Mode role. Defaults to `solo`. */
	role?: AgentRole
	/** The agent's whimsical Fairy name. Generated if not provided. */
	fairyName?: string
	/** The agent's Fairy sprite colour. Defaults to the pre-Team-Mode colour. */
	fairyColor?: string
}
```
to:
```ts
	/** The agent's whimsical Bee name. Persisted so names are stable across reloads. */
	beeName?: string
	/** The agent's Bee sprite colour. Persisted so looks are stable across reloads. */
	beeColor?: string
}

export interface TldrawAgentOptions {
	/** The editor to associate the agent with. */
	editor: Editor
	/** A key used to differentiate the agent from other agents. */
	id: string
	/** A callback for when an error occurs. */
	onError: (e: any) => void
	/** The agent's Team Mode role. Defaults to `solo`. */
	role?: AgentRole
	/** The agent's whimsical Bee name. Generated if not provided. */
	beeName?: string
	/** The agent's Bee sprite colour. Defaults to the pre-Team-Mode colour. */
	beeColor?: string
}
```

- [ ] **Step 5: Rename the class fields, constructor param, and constructor body**

Change:
```ts
	/** The agent's whimsical Fairy name, stable for the agent's lifetime. */
	fairyName: string

	/** The agent's Fairy sprite colour. */
	fairyColor: string
```
to:
```ts
	/** The agent's whimsical Bee name, stable for the agent's lifetime. */
	beeName: string

	/** The agent's Bee sprite colour. */
	beeColor: string
```

Change:
```ts
	constructor({ editor, id, onError, role, fairyName, fairyColor }: TldrawAgentOptions) {
		this.editor = editor
		this.id = id
		this.onError = onError
		this.role = role ?? 'solo'
		this.fairyName = fairyName ?? generateFairyName()
		this.fairyColor = fairyColor ?? DEFAULT_FAIRY_COLOR
```
to:
```ts
	constructor({ editor, id, onError, role, beeName, beeColor }: TldrawAgentOptions) {
		this.editor = editor
		this.id = id
		this.onError = onError
		this.role = role ?? 'solo'
		this.beeName = beeName ?? generateFairyName()
		this.beeColor = beeColor ?? DEFAULT_BEE_COLOR
```

- [ ] **Step 6: Rename `serializeState`/`loadState` field references**

Change:
```ts
			role: this.role,
			fairyName: this.fairyName,
			fairyColor: this.fairyColor,
		}
```
to:
```ts
			role: this.role,
			beeName: this.beeName,
			beeColor: this.beeColor,
		}
```

Change:
```ts
		if (state.fairyName) {
			this.fairyName = state.fairyName
		}
		if (state.fairyColor) {
			this.fairyColor = state.fairyColor
		}
```
to:
```ts
		if (state.beeName) {
			this.beeName = state.beeName
		}
		if (state.beeColor) {
			this.beeColor = state.beeColor
		}
```

- [ ] **Step 7: Rename the "not in an active mode" error string**

Change:
```ts
			throw new Error(
				`Fairy is not in an active mode so can't act right now. Current mode: ${modeDefinition.type}`
			)
```
to:
```ts
			throw new Error(
				`Bee is not in an active mode so can't act right now. Current mode: ${modeDefinition.type}`
			)
```

- [ ] **Step 8: Rename the position-extraction call sites inside `requestAgentActions`**

Change:
```ts
								const fairyPosition =
									extractFairyPositionFromDiff(
										diff,
										(shapeId) => {
											try {
												const bounds = editor.getShapePageBounds(shapeId as TLShapeId)
												if (bounds) lastShapeBoundsForResting = bounds
												return bounds
											} catch {
												return null
											}
										},
										{ placement: 'center', zoomLevel: editor.getZoomLevel() }
									) ??
									extractFairyPosition(transformedAction, (position) =>
										helpers.removeOffsetFromVec(position)
									)
								if (fairyPosition) {
									this.requests.setFairyPosition(fairyPosition)
								}
```
to:
```ts
								const beePosition =
									extractBeePositionFromDiff(
										diff,
										(shapeId) => {
											try {
												const bounds = editor.getShapePageBounds(shapeId as TLShapeId)
												if (bounds) lastShapeBoundsForResting = bounds
												return bounds
											} catch {
												return null
											}
										},
										{ placement: 'center', zoomLevel: editor.getZoomLevel() }
									) ??
									extractBeePosition(transformedAction, (position) =>
										helpers.removeOffsetFromVec(position)
									)
								if (beePosition) {
									this.requests.setBeePosition(beePosition)
								}
```

- [ ] **Step 9: Rename the resting-position call at the end of `requestAgentActions`**

Change:
```ts
				if (!cancelled && lastShapeBoundsForResting) {
					const restingPos = getFairyPositionFromBounds(lastShapeBoundsForResting, 'resting', editor.getZoomLevel())
					this.requests.setFairyPosition(restingPos)
				}
```
to:
```ts
				if (!cancelled && lastShapeBoundsForResting) {
					const restingPos = getBeePositionFromBounds(lastShapeBoundsForResting, 'resting', editor.getZoomLevel())
					this.requests.setBeePosition(restingPos)
				}
```

- [ ] **Step 10: Verify no other `Fairy` identifiers remain in these two files**

Run: `grep -n "Fairy" client/agent/TldrawAgent.ts client/agent/managers/AgentRequestManager.ts`
Expected: no output (the file still imports `generateFairyName` from `../utils/generateFairyName` — that import line contains the substring "Fairy" in the function/path name, which is correct and expected to remain; if the grep only flags that one line, that's fine).

- [ ] **Step 11: Type-check** (this task touches types consumed everywhere else — check now before other files reference the old names)

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: errors in every file that still calls `agent.fairyName`, `agent.fairyColor`, `setFairyPosition`, `getFairyPosition` — this is expected at this point in the plan (Tasks 4, 5, 7, 8, 9, 10 fix them). Confirm the errors are ONLY in files not yet touched: `AgentAppAgentsManager.ts`, `AgentAppTeamManager.ts`, `ChatPanel.tsx`, `TeamRoster.tsx`, `FairyAvatarOverlay.tsx`, `AgentViewportBoundsHighlights.tsx`, `AgentModeChart.ts`, `DispatchExecutorsActionUtil.ts`. If any error appears in a file already renamed, fix it before proceeding.

- [ ] **Step 12: Commit**

```bash
git add client/agent/managers/AgentRequestManager.ts client/agent/TldrawAgent.ts
git commit -m "rename: TldrawAgent/AgentRequestManager fairy fields -> bee"
```

---

### Task 4: Rename `AgentAppAgentsManager`'s `CreateAgentOptions` fields and spawn call

**Files:**
- Modify: `client/agent/managers/AgentAppAgentsManager.ts:4-5,17-21,84-115`

**Interfaces:**
- Consumes: `getDefaultBeeSpawnPosition` from Task 2 (`../../utils/beePosition`), `TldrawAgent.beeName`/`beeColor` from Task 3.
- Produces: `CreateAgentOptions.beeName?`, `CreateAgentOptions.beeColor?`. `createAgent(id, options?)` unchanged signature but now assigns `beeName`/`beeColor` on the created agent.

- [ ] **Step 1: Update the imports**

Change:
```ts
import { getDefaultFairySpawnPosition } from '../../utils/fairyPosition'
import { generateFairyName } from '../../utils/generateFairyName'
```
to:
```ts
import { getDefaultBeeSpawnPosition } from '../../utils/beePosition'
import { generateFairyName } from '../../utils/generateFairyName'
```

- [ ] **Step 2: Rename `CreateAgentOptions` fields**

Change:
```ts
export interface CreateAgentOptions {
	role?: AgentRole
	fairyName?: string
	fairyColor?: string
}
```
to:
```ts
export interface CreateAgentOptions {
	role?: AgentRole
	beeName?: string
	beeColor?: string
}
```

- [ ] **Step 3: Rename the body of `createAgent`**

Change:
```ts
	createAgent(id: string, options?: CreateAgentOptions): TldrawAgent {
		const existingAgent = this.getAgent(id)
		if (existingAgent) {
			return existingAgent
		}

		const existingNames = this.getAgents().map((a) => a.fairyName)
		const fairyName = options?.fairyName ?? generateFairyName(existingNames)

		const agent = new TldrawAgent({
			editor: this.app.editor,
			id,
			onError: this.app.options.onError,
			role: options?.role,
			fairyName,
			fairyColor: options?.fairyColor,
		})

		// Register the agent in the static atom
		AgentAppAgentsManager.$agents.update(this.app.editor, (agents) => [...agents, agent])

		if (!agent.requests.getFairyPosition()) {
			agent.requests.setFairyPosition(
				getDefaultFairySpawnPosition(this.app.editor.getViewportPageBounds(), this.getAgents().length - 1)
			)
		}

		return agent
	}
```
to:
```ts
	createAgent(id: string, options?: CreateAgentOptions): TldrawAgent {
		const existingAgent = this.getAgent(id)
		if (existingAgent) {
			return existingAgent
		}

		const existingNames = this.getAgents().map((a) => a.beeName)
		const beeName = options?.beeName ?? generateFairyName(existingNames)

		const agent = new TldrawAgent({
			editor: this.app.editor,
			id,
			onError: this.app.options.onError,
			role: options?.role,
			beeName,
			beeColor: options?.beeColor,
		})

		// Register the agent in the static atom
		AgentAppAgentsManager.$agents.update(this.app.editor, (agents) => [...agents, agent])

		if (!agent.requests.getBeePosition()) {
			agent.requests.setBeePosition(
				getDefaultBeeSpawnPosition(this.app.editor.getViewportPageBounds(), this.getAgents().length - 1)
			)
		}

		return agent
	}
```

Note: `generateFairyName(existingNames)` call is intentionally unchanged — this path is Solo Mode's spawn path (`ensureAtLeastOneAgent` → `createAgent(generateAgentId())` with no `beeName` option), so it still needs the old joke-name pool per spec.

- [ ] **Step 4: Update the `@param` doc comment above `createAgent`**

Change `@param options - Optional role, fairy name, and color` to `@param options - Optional role, bee name, and color`.

- [ ] **Step 5: Commit**

```bash
git add client/agent/managers/AgentAppAgentsManager.ts
git commit -m "rename: AgentAppAgentsManager fairy fields -> bee"
```

---

### Task 5: `AgentAppTeamManager` — hardcoded Beeyonce/MacBee/WannaBee assignment

This is the first behavioral change: Team Mode stops using random names and colors picked per-index, and instead assigns fixed identities by role/position.

**Files:**
- Modify: `client/agent/managers/AgentAppTeamManager.ts`

**Interfaces:**
- Consumes: `getTeamBeeSpawnPosition` from Task 2, `beeColor`/`beeName` options from Task 4's `CreateAgentOptions`.
- Produces: exported constants `PLANNER_BEE_NAME = 'Beeyonce'`, `EXECUTOR_BEE_NAMES = ['MacBee', 'WannaBee']` (used later by Task 9 for the slacking gate and Task 11 for prompt text).

- [ ] **Step 1: Update the import and color/name constants**

Change:
```ts
import { generateAgentId } from './AgentAppAgentsManager'
import { AgentAppPlanManager } from './AgentAppPlanManager'
import { shouldStartReview, MAX_REVIEW_ROUNDS } from './sharedPlan'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { TldrawAgent } from '../TldrawAgent'
import { getTeamFairySpawnPosition } from '../../utils/fairyPosition'

const PLANNER_COLOR = '#6366f1'
const EXECUTOR_COLORS = ['#f59e0b', '#10b981']
```
to:
```ts
import { generateAgentId } from './AgentAppAgentsManager'
import { AgentAppPlanManager } from './AgentAppPlanManager'
import { shouldStartReview, MAX_REVIEW_ROUNDS } from './sharedPlan'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { TldrawAgent } from '../TldrawAgent'
import { getTeamBeeSpawnPosition } from '../../utils/beePosition'

const PLANNER_COLOR = '#6366f1'
const EXECUTOR_COLORS = ['#f59e0b', '#10b981']

/** The Planner's fixed name in Team Mode. Team Mode always has exactly one planner. */
export const PLANNER_BEE_NAME = 'Beeyonce'

/**
 * The Executors' fixed names in Team Mode, in spawn order. Team Mode always
 * spawns exactly two executors, so index 0 is always MacBee and index 1 is
 * always WannaBee.
 */
export const EXECUTOR_BEE_NAMES = ['MacBee', 'WannaBee']
```

- [ ] **Step 2: Update the class doc comment**

Change:
```ts
/**
 * Orchestrates Team Mode: creates the Planner and Executor Fairies, routes user
 * prompts to the Planner, and runs the reactive review-loop coordinator.
 */
```
to:
```ts
/**
 * Orchestrates Team Mode: creates the Planner and Executor Bees, routes user
 * prompts to the Planner, and runs the reactive review-loop coordinator.
 */
```

- [ ] **Step 3: Assign fixed names when creating the planner and executors in `activate()`**

Change:
```ts
		// Create all 3 team agents in one batch
		this.planner = this.app.agents.createAgent(generateAgentId(), {
			role: 'planner',
			fairyColor: PLANNER_COLOR,
		})
		this.planner.mode.setMode('planning')
		this.planner.requests.setFairyPosition(getTeamFairySpawnPosition(viewportBounds, 0))

		for (let i = 0; i < 2; i++) {
			const executor = this.app.agents.createAgent(generateAgentId(), {
				role: 'executor',
				fairyColor: EXECUTOR_COLORS[i],
			})
			// Don't set mode to 'executing' here. Leave in 'idling' so that
			// when dispatched, idling.onPromptStart transitions to 'executing'.
			executor.requests.setFairyPosition(getTeamFairySpawnPosition(viewportBounds, i + 1))
			this.executors.push(executor)
		}
```
to:
```ts
		// Create all 3 team agents in one batch, with fixed names by role/position
		this.planner = this.app.agents.createAgent(generateAgentId(), {
			role: 'planner',
			beeName: PLANNER_BEE_NAME,
			beeColor: PLANNER_COLOR,
		})
		this.planner.mode.setMode('planning')
		this.planner.requests.setBeePosition(getTeamBeeSpawnPosition(viewportBounds, 0))

		for (let i = 0; i < 2; i++) {
			const executor = this.app.agents.createAgent(generateAgentId(), {
				role: 'executor',
				beeName: EXECUTOR_BEE_NAMES[i],
				beeColor: EXECUTOR_COLORS[i],
			})
			// Don't set mode to 'executing' here. Leave in 'idling' so that
			// when dispatched, idling.onPromptStart transitions to 'executing'.
			executor.requests.setBeePosition(getTeamBeeSpawnPosition(viewportBounds, i + 1))
			this.executors.push(executor)
		}
```

- [ ] **Step 4: Rename the `promptPlanner` prompt string and its "Planner Fairy" reference**

Change:
```ts
	promptPlanner(message: string) {
		if (!this.planner) return
		this.planner.interrupt({
			input: {
				agentMessages: [
					`You are the Planner Fairy. Decompose this user request into a Shared Plan using the writePlan action. Each plan item must have: text (what to draw), and disjoint bounds (x, y, w, h) so Executors draw in separate regions. After writing the plan, use dispatchExecutors to start the Executors.\n\nUser request: ${message}`,
				],
				source: 'user',
			},
		})
	}
```
to:
```ts
	promptPlanner(message: string) {
		if (!this.planner) return
		this.planner.interrupt({
			input: {
				agentMessages: [
					`You are ${PLANNER_BEE_NAME}, the Queen Bee planner. Decompose this user request into a Shared Plan using the writePlan action. Each plan item must have: text (what to draw), and disjoint bounds (x, y, w, h) so Executors draw in separate regions. After writing the plan, use dispatchExecutors to start the Executors.\n\nUser request: ${message}`,
				],
				source: 'user',
			},
		})
	}
```

- [ ] **Step 5: Rename the `animateReviewTour` position calls**

Change:
```ts
				this.planner.requests.setFairyPosition(pos)
```
to:
```ts
				this.planner.requests.setBeePosition(pos)
```

- [ ] **Step 6: Verify no other `Fairy` identifiers remain**

Run: `grep -n "Fairy" client/agent/managers/AgentAppTeamManager.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/agent/managers/AgentAppTeamManager.ts
git commit -m "feat: hardcode Beeyonce/MacBee/WannaBee team assignment"
```

---

### Task 6: `FairySprite.tsx` → `BeeSprite.tsx` — full sprite redesign

Redesigns the sprite body per the approved visual-companion mockups: classic round bumble body (yellow/black) for Beeyonce/WannaBee/solo-mode bees, head+segmented-abdomen body in Saltire white/blue for MacBee, a crown+sash overlay for Beeyonce, and a phone+duck-lips slacking accessory for the new `slacking` state.

**Files:**
- Create: `client/components/BeeSprite.tsx`
- Create: `client/components/BeeSprite.test.tsx`
- Delete: `client/components/FairySprite.tsx`
- Delete: `client/components/FairySprite.test.tsx`

**Interfaces:**
- Consumes: `BeeState` from Task 1 (`../types/BeeState`).
- Produces: `export function BeeSprite({ beeName, state, color }: { beeName: string; state: BeeState; color?: string })`. Root element has class `bee-sprite bee-sprite--${state}`, `data-bee-state={state}`. Inner pose group has class `bee-sprite__pose bee-sprite__pose--${poseName}` where `poseName` is `'front' | 'drawing' | 'planning' | 'slacking'`.

- [ ] **Step 1: Create `client/components/BeeSprite.tsx`**

```tsx
import { BeeState } from '../types/BeeState'

export function BeeSprite({
	beeName,
	state,
	color = 'currentColor',
}: {
	beeName: string
	state: BeeState
	color?: string
}) {
	const rootClassName = `bee-sprite bee-sprite--${state}`
	const svgClassName = `bee-sprite__svg bee-sprite__svg--${state}`
	const poseName = getPoseName(state)
	const variant: 'classic' | 'saltire' = beeName === 'MacBee' ? 'saltire' : 'classic'
	const isQueen = beeName === 'Beeyonce'

	return (
		<div
			className={rootClassName}
			data-bee-state={state}
			style={{ pointerEvents: 'none' }}
		>
			<div className="bee-sprite__figure" style={{ pointerEvents: 'auto' }}>
				<svg
					aria-label={`${beeName} bee`}
					className={svgClassName}
					viewBox="0 0 48 56"
					width="48"
					height="48"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<g className={`bee-sprite__pose bee-sprite__pose--${poseName}`}>
						<BeeWings color={color} />
						<BeeAntennae />
						<BeeBody variant={variant} />
						{poseName === 'planning' && <PlanningClipboard />}
						{poseName === 'slacking' && <SlackingAccessory />}
					</g>
					{isQueen && <QueenRegalia />}
				</svg>
			</div>
		</div>
	)
}

function getPoseName(state: BeeState): 'front' | 'drawing' | 'planning' | 'slacking' {
	if (state === 'planning') return 'planning'
	if (state === 'drawing') return 'drawing'
	if (state === 'slacking') return 'slacking'
	return 'front'
}

function BeeWings({ color }: { color: string }) {
	return (
		<g className="bee-sprite__wings">
			<ellipse
				className="bee-sprite__wing bee-sprite__wing--left"
				cx="15"
				cy="20"
				rx="9"
				ry="5"
				fill="rgba(255,255,255,0.6)"
				stroke={color}
				transform="rotate(-15 15 20)"
			/>
			<ellipse
				className="bee-sprite__wing bee-sprite__wing--right"
				cx="33"
				cy="20"
				rx="9"
				ry="5"
				fill="rgba(255,255,255,0.6)"
				stroke={color}
				transform="rotate(15 33 20)"
			/>
		</g>
	)
}

function BeeAntennae() {
	return (
		<g className="bee-sprite__antennae">
			<path d="M18 12C16 8 14 6 12 5" stroke="currentColor" strokeLinecap="round" />
			<path d="M30 12C32 8 34 6 36 5" stroke="currentColor" strokeLinecap="round" />
			<circle cx="12" cy="4.5" r="1.5" fill="currentColor" />
			<circle cx="36" cy="4.5" r="1.5" fill="currentColor" />
		</g>
	)
}

function BeeBody({ variant }: { variant: 'classic' | 'saltire' }) {
	if (variant === 'saltire') {
		return (
			<g className="bee-sprite__body bee-sprite__body--saltire">
				<circle cx="24" cy="14" r="6" fill="#0033A0" />
				<circle cx="21" cy="13" r="1" fill="#fff" />
				<circle cx="27" cy="13" r="1" fill="#fff" />
				<path
					d="M15 22C15 20 33 20 33 22V38C33 46 15 46 15 38Z"
					fill="#fff"
					stroke="#0033A0"
				/>
				<path d="M15 27H33" stroke="#0033A0" strokeWidth="3" />
				<path d="M15 33H33" stroke="#0033A0" strokeWidth="3" />
				<path d="M16 39C18 41 30 41 32 39" stroke="#0033A0" strokeWidth="3" fill="none" />
			</g>
		)
	}

	return (
		<g className="bee-sprite__body bee-sprite__body--classic">
			<ellipse cx="24" cy="30" rx="13" ry="16" fill="#FFC94A" />
			<path d="M12 22C16 24 32 24 36 22" stroke="currentColor" strokeWidth="3" fill="none" />
			<path d="M12 30C16 32 32 32 36 30" stroke="currentColor" strokeWidth="3" fill="none" />
			<path d="M13 38C17 40 31 40 35 38" stroke="currentColor" strokeWidth="3" fill="none" />
			<circle cx="19" cy="26" r="1.3" fill="currentColor" />
			<circle cx="29" cy="26" r="1.3" fill="currentColor" />
		</g>
	)
}

function QueenRegalia() {
	return (
		<g className="bee-sprite__queen-regalia">
			<polygon
				className="bee-sprite__crown"
				points="14,8 24,2 34,8 31,14 17,14"
				fill="#FFD700"
				stroke="#B8860B"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
			<path
				className="bee-sprite__sash"
				d="M15 20L33 42"
				stroke="#8B008B"
				strokeWidth="3"
				opacity="0.85"
			/>
		</g>
	)
}

function PlanningClipboard() {
	return (
		<g className="bee-sprite__clipboard">
			<rect x="2" y="30" width="8" height="11" rx="1" fill="white" stroke="currentColor" strokeWidth="0.8" />
			<path d="M4 33H8" stroke="currentColor" strokeWidth="0.5" />
			<path d="M4 35.5H8" stroke="currentColor" strokeWidth="0.5" />
			<path d="M4 38H7" stroke="currentColor" strokeWidth="0.5" />
		</g>
	)
}

function SlackingAccessory() {
	return (
		<g className="bee-sprite__slacking-accessory">
			{/* left arm holding phone */}
			<path d="M12 24L18 22" stroke="currentColor" strokeLinecap="round" />
			<rect
				x="17"
				y="14"
				width="7"
				height="11"
				rx="1.3"
				fill="#333"
				transform="rotate(20 20.5 19.5)"
			/>
			{/* right arm flung out dramatically */}
			<path d="M36 24L44 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			{/* duck lips */}
			<ellipse
				className="bee-sprite__duck-lips"
				cx="24"
				cy="31"
				rx="3"
				ry="1.6"
				fill="#D6336C"
				stroke="#a61e4d"
				strokeWidth="0.6"
			/>
		</g>
	)
}
```

- [ ] **Step 2: Delete the old files**

```bash
rm client/components/FairySprite.tsx client/components/FairySprite.test.tsx
```

- [ ] **Step 3: Create `client/components/BeeSprite.test.tsx`**

```tsx
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BeeSprite } from './BeeSprite'

describe('BeeSprite', () => {
	test('keeps the bee name out of visible markup while preserving the pointer-event contract', () => {
		const markup = renderToStaticMarkup(
			<BeeSprite beeName="Bonnie Kettlewick" state="idle" />
		)

		expect(markup).toContain('data-bee-state="idle"')
		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('<svg')
		expect(markup).toContain('aria-label="Bonnie Kettlewick bee"')
		expect(markup).not.toContain('bee-sprite__name')
	})

	test('adds state-specific classes and a distinct drawing pose', () => {
		const drawingMarkup = renderToStaticMarkup(
			<BeeSprite beeName="Grog Fernsby" state="drawing" />
		)
		const annoyedMarkup = renderToStaticMarkup(
			<BeeSprite beeName="Grog Fernsby" state="annoyed" />
		)

		expect(drawingMarkup).toContain('bee-sprite--drawing')
		expect(drawingMarkup).toContain('bee-sprite__pose--drawing')
		expect(drawingMarkup).not.toContain('bee-sprite__pose--front')
		expect(annoyedMarkup).toContain('bee-sprite--annoyed')
		expect(annoyedMarkup).toContain('bee-sprite__pose--front')
	})

	test('renders the saltire body variant only for MacBee', () => {
		const macBeeMarkup = renderToStaticMarkup(<BeeSprite beeName="MacBee" state="idle" />)
		const otherMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="idle" />)

		expect(macBeeMarkup).toContain('bee-sprite__body--saltire')
		expect(macBeeMarkup).not.toContain('bee-sprite__body--classic')
		expect(otherMarkup).toContain('bee-sprite__body--classic')
		expect(otherMarkup).not.toContain('bee-sprite__body--saltire')
	})

	test('renders queen regalia only for Beeyonce', () => {
		const queenMarkup = renderToStaticMarkup(<BeeSprite beeName="Beeyonce" state="idle" />)
		const otherMarkup = renderToStaticMarkup(<BeeSprite beeName="MacBee" state="idle" />)

		expect(queenMarkup).toContain('bee-sprite__queen-regalia')
		expect(queenMarkup).toContain('bee-sprite__crown')
		expect(queenMarkup).toContain('bee-sprite__sash')
		expect(otherMarkup).not.toContain('bee-sprite__queen-regalia')
	})

	test('renders the slacking accessory only in the slacking state', () => {
		const slackingMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="slacking" />)
		const idleMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="idle" />)

		expect(slackingMarkup).toContain('bee-sprite__pose--slacking')
		expect(slackingMarkup).toContain('bee-sprite__slacking-accessory')
		expect(slackingMarkup).toContain('bee-sprite__duck-lips')
		expect(idleMarkup).not.toContain('bee-sprite__slacking-accessory')
	})
})
```

- [ ] **Step 4: Run the new tests**

Run: `bun test client/components/BeeSprite.test.tsx`
Expected: `5 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add client/components/BeeSprite.tsx client/components/BeeSprite.test.tsx
git rm client/components/FairySprite.tsx client/components/FairySprite.test.tsx
git commit -m "feat: redesign sprite as honeybee body (classic/saltire, queen regalia, slacking pose)"
```

---

### Task 7: Rename `FairyReticle` → `BeeReticle`, `useFairyPosition` → `useBeePosition`

**Files:**
- Create: `client/components/BeeReticle.tsx`
- Create: `client/hooks/useBeePosition.ts`
- Delete: `client/components/FairyReticle.tsx`
- Delete: `client/hooks/useFairyPosition.ts`

**Interfaces:**
- Produces: `export function BeeReticle({ color, active }: { color: string; active: boolean })` (identical behavior, class renamed to `bee-reticle`). `export function useBeePosition(agent: TldrawAgent)` calling `agent.requests.getBeePosition()`.

- [ ] **Step 1: Create `client/components/BeeReticle.tsx`**

```tsx
const RETICLE_SIZE = 48
const CORNER_LEN = 10
const GAP = 4

export function BeeReticle({ color, active }: { color: string; active: boolean }) {
	return (
		<div
			className="bee-reticle"
			style={{
				position: 'absolute',
				left: '50%',
				top: '50%',
				width: RETICLE_SIZE,
				height: RETICLE_SIZE,
				transform: 'translate(-50%, -50%)',
				pointerEvents: 'none',
				opacity: active ? 1 : 0,
				transition: 'opacity 200ms ease-out',
			}}
		>
			<svg
				width={RETICLE_SIZE}
				height={RETICLE_SIZE}
				viewBox={`0 0 ${RETICLE_SIZE} ${RETICLE_SIZE}`}
				fill="none"
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
			>
				{/* Top-left corner */}
				<path d={`M${GAP},${CORNER_LEN} L${GAP},${GAP} L${CORNER_LEN},${GAP}`} />
				{/* Top-right corner */}
				<path d={`M${RETICLE_SIZE - CORNER_LEN},${GAP} L${RETICLE_SIZE - GAP},${GAP} L${RETICLE_SIZE - GAP},${CORNER_LEN}`} />
				{/* Bottom-left corner */}
				<path d={`M${GAP},${RETICLE_SIZE - CORNER_LEN} L${GAP},${RETICLE_SIZE - GAP} L${CORNER_LEN},${RETICLE_SIZE - GAP}`} />
				{/* Bottom-right corner */}
				<path d={`M${RETICLE_SIZE - CORNER_LEN},${RETICLE_SIZE - GAP} L${RETICLE_SIZE - GAP},${RETICLE_SIZE - GAP} L${RETICLE_SIZE - GAP},${RETICLE_SIZE - CORNER_LEN}`} />
			</svg>
		</div>
	)
}
```

- [ ] **Step 2: Create `client/hooks/useBeePosition.ts`**

```ts
import { useValue } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'

export function useBeePosition(agent: TldrawAgent) {
	return useValue('beePosition', () => agent.requests.getBeePosition(), [agent])
}
```

- [ ] **Step 3: Delete the old files**

```bash
rm client/components/FairyReticle.tsx client/hooks/useFairyPosition.ts
```

- [ ] **Step 4: Commit**

```bash
git add client/components/BeeReticle.tsx client/hooks/useBeePosition.ts
git rm client/components/FairyReticle.tsx client/hooks/useFairyPosition.ts
git commit -m "rename: FairyReticle -> BeeReticle, useFairyPosition -> useBeePosition"
```

---

### Task 8: Rename `FairyAvatarOverlay` → `BeeAvatarOverlay` (+ test)

**Files:**
- Create: `client/components/BeeAvatarOverlay.tsx`
- Create: `client/components/BeeAvatarOverlay.test.tsx`
- Delete: `client/components/FairyAvatarOverlay.tsx`
- Delete: `client/components/FairyAvatarOverlay.test.tsx`

**Interfaces:**
- Consumes: `useBeePosition` (Task 7), `BeeState` (Task 1), `BeeSprite` (Task 6), `BeeReticle` (Task 7), `TldrawAgent.beeName`/`beeColor` (Task 3).
- Produces: `export function getBeeSpriteScale(zoomLevel: number)`, `export function getBeeScreenPosition(pagePosition, pageToScreen)`, `export function BeeAvatarOverlays()`, `export function BeeAvatarOverlay({ agent }: { agent: TldrawAgent })`, `export function didBeePositionMove(previousPosition, currentPosition)`.

- [ ] **Step 1: Create `client/components/BeeAvatarOverlay.tsx`**

```tsx
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useEditor, useValue, VecModel } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'
import { useAgents } from '../agent/TldrawAgentAppProvider'
import { useBeePosition } from '../hooks/useBeePosition'
import { BeeState } from '../types/BeeState'
import { BeeSprite } from './BeeSprite'
import { BeeReticle } from './BeeReticle'

const BEE_MOVE_DURATION_MS = 400
const BEE_ANNOYED_DELAY_MS = 2000

export function getBeeSpriteScale(zoomLevel: number) {
	return zoomLevel > 0 ? 1 / zoomLevel : 1
}

export function getBeeScreenPosition(
	pagePosition: VecModel | null,
	pageToScreen: (pos: VecModel) => VecModel
): VecModel | null {
	if (!pagePosition) return null
	return pageToScreen(pagePosition)
}

export function BeeAvatarOverlays() {
	const agents = useAgents()

	return (
		<>
			{agents.map((agent) => (
				<BeeAvatarOverlay key={agent.id} agent={agent} />
			))}
		</>
	)
}

export function BeeAvatarOverlay({ agent }: { agent: TldrawAgent }) {
	const editor = useEditor()
	const beeName = agent.beeName
	const beePosition = useBeePosition(agent)
	const isActive = useValue(
		`bee-active-${agent.id}`,
		() => agent.requests.isGenerating(),
		[agent]
	)
	const [motionState, setMotionState] = useState<BeeState>('idle')
	const [isAnnoyed, setIsAnnoyed] = useState(false)
	const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const annoyedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isPressActiveRef = useRef(false)
	const activePointerIdRef = useRef<number | null>(null)
	const dragOffsetRef = useRef<VecModel | null>(null)
	const previousBeePositionRef = useRef<VecModel | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const zoomLevel = useValue(
		'beeZoomLevel',
		() => {
			editor.getCamera()
			return editor.getZoomLevel()
		},
		[editor]
	)

	const pagePosition = beePosition


	const clearAnnoyedTimer = () => {
		if (annoyedTimeoutRef.current) {
			clearTimeout(annoyedTimeoutRef.current)
			annoyedTimeoutRef.current = null
		}
	}

	const clearPointerInteraction = () => {
		activePointerIdRef.current = null
		dragOffsetRef.current = null
		isPressActiveRef.current = false
		clearAnnoyedTimer()
		setIsAnnoyed(false)
		setIsDragging(false)
	}

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!pagePosition) return

		event.preventDefault()
		event.stopPropagation()
		event.currentTarget.setPointerCapture(event.pointerId)

		const pointerPagePosition = editor.screenToPage({ x: event.clientX, y: event.clientY })
		activePointerIdRef.current = event.pointerId
		dragOffsetRef.current = {
			x: pagePosition.x - pointerPagePosition.x,
			y: pagePosition.y - pointerPagePosition.y,
		}
		isPressActiveRef.current = true
		setIsDragging(true)

		clearAnnoyedTimer()
		annoyedTimeoutRef.current = setTimeout(() => {
			if (isPressActiveRef.current) {
				setIsAnnoyed(true)
			}
			annoyedTimeoutRef.current = null
		}, BEE_ANNOYED_DELAY_MS)
	}

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (activePointerIdRef.current !== event.pointerId || !dragOffsetRef.current) return

		event.preventDefault()
		event.stopPropagation()

		isPressActiveRef.current = false
		clearAnnoyedTimer()

		const pointerPagePosition = editor.screenToPage({ x: event.clientX, y: event.clientY })
		agent.requests.setBeePosition({
			x: pointerPagePosition.x + dragOffsetRef.current.x,
			y: pointerPagePosition.y + dragOffsetRef.current.y,
		})
	}

	const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (activePointerIdRef.current !== event.pointerId) return

		event.preventDefault()
		event.stopPropagation()
		clearPointerInteraction()
	}

	useEffect(() => {
		if (!pagePosition) return
		if (activePointerIdRef.current !== null) return

		const hasMoved = didBeePositionMove(previousBeePositionRef.current, pagePosition)
		previousBeePositionRef.current = pagePosition

		if (!hasMoved) return

		setMotionState('drawing')
		if (movementTimeoutRef.current) {
			clearTimeout(movementTimeoutRef.current)
		}
		movementTimeoutRef.current = setTimeout(() => {
			setMotionState('idle')
			movementTimeoutRef.current = null
		}, BEE_MOVE_DURATION_MS)
	}, [pagePosition])

	useEffect(() => {
		window.addEventListener('mouseup', clearPointerInteraction)
		window.addEventListener('pointerup', clearPointerInteraction)
		window.addEventListener('pointercancel', clearPointerInteraction)
		window.addEventListener('blur', clearPointerInteraction)

		return () => {
			window.removeEventListener('mouseup', clearPointerInteraction)
			window.removeEventListener('pointerup', clearPointerInteraction)
			window.removeEventListener('pointercancel', clearPointerInteraction)
			window.removeEventListener('blur', clearPointerInteraction)

			if (movementTimeoutRef.current) {
				clearTimeout(movementTimeoutRef.current)
			}
			if (annoyedTimeoutRef.current) {
				clearTimeout(annoyedTimeoutRef.current)
			}
		}
	}, [])

	if (!pagePosition) return null

	const plannerPlanning = agent.role === 'planner' && isActive && motionState === 'idle'
	const state: BeeState = isAnnoyed ? 'annoyed' : plannerPlanning ? 'planning' : motionState

	return (
		<div
			className="bee-avatar-overlay"
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				overflow: 'visible',
			}}
		>
			<div
				className="bee-avatar-overlay__sprite"
				style={{
					position: 'absolute',
					left: pagePosition.x,
					top: pagePosition.y,
					transition: isDragging
						? 'none'
						: `left ${BEE_MOVE_DURATION_MS}ms ease-out, top ${BEE_MOVE_DURATION_MS}ms ease-out`,
					transform: 'translate(-50%, -100%)',
					pointerEvents: 'auto',
					cursor: isDragging ? 'grabbing' : 'grab',
					touchAction: 'none',
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				<div
					style={{
						transform: `scale(${getBeeSpriteScale(zoomLevel)})`,
						transformOrigin: 'center bottom',
						position: 'relative',
					}}
				>
					<BeeReticle color={agent.beeColor} active={isActive} />
					<BeeSprite beeName={beeName} state={state} color={agent.beeColor} />
				</div>
			</div>
		</div>
	)
}

export function didBeePositionMove(
	previousPosition: VecModel | null,
	currentPosition: VecModel | null
) {
	if (!previousPosition) return false
	if (!currentPosition) return false
	return (
		previousPosition.x !== currentPosition.x ||
		previousPosition.y !== currentPosition.y
	)
}
```

- [ ] **Step 2: Delete the old files**

```bash
rm client/components/FairyAvatarOverlay.tsx client/components/FairyAvatarOverlay.test.tsx
```

- [ ] **Step 3: Create `client/components/BeeAvatarOverlay.test.tsx`**

```tsx
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { didBeePositionMove, getBeeScreenPosition, getBeeSpriteScale } from './BeeAvatarOverlay'

describe('BeeAvatarOverlay styles', () => {
	test('uses the expected absolute overlay positioning contract', () => {
		const markup = renderToStaticMarkup(
			<div
				className="bee-avatar-overlay"
				style={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					overflow: 'visible',
				}}
			>
				<div
					className="bee-avatar-overlay__sprite"
					style={{
						position: 'absolute',
						left: 120,
						top: 240,
						transition: 'left 400ms ease-out, top 400ms ease-out',
						transform: 'translate(-50%, -100%)',
						pointerEvents: 'auto',
						cursor: 'grab',
						touchAction: 'none',
					}}
				/>
			</div>
		)

		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('overflow:visible')
		expect(markup).toContain('left:120px')
		expect(markup).toContain('top:240px')
		expect(markup).toContain('transition:left 400ms ease-out, top 400ms ease-out')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('cursor:grab')
		expect(markup).toContain('touch-action:none')
	})

	test('only treats page-space position changes as movement', () => {
		expect(didBeePositionMove({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(false)
		expect(didBeePositionMove({ x: 10, y: 20 }, { x: 11, y: 20 })).toBe(true)
		expect(didBeePositionMove(null, { x: 10, y: 20 })).toBe(false)
		expect(didBeePositionMove({ x: 10, y: 20 }, null)).toBe(false)
		expect(didBeePositionMove(null, null)).toBe(false)
	})

	test('keeps the sprite scale inverse to zoom level', () => {
		expect(getBeeSpriteScale(1)).toBe(1)
		expect(getBeeSpriteScale(2)).toBe(0.5)
		expect(getBeeSpriteScale(0.5)).toBe(2)
		expect(getBeeSpriteScale(0)).toBe(1)
	})

	test('converts page position to screen position via pageToScreen transform', () => {
		const pageToScreen = (pos: { x: number; y: number }) => ({ x: pos.x * 2, y: pos.y * 3 })
		expect(getBeeScreenPosition({ x: 50, y: 40 }, pageToScreen)).toEqual({ x: 100, y: 120 })
		expect(getBeeScreenPosition(null, pageToScreen)).toBeNull()
	})
})
```

- [ ] **Step 4: Run the new tests**

Run: `bun test client/components/BeeAvatarOverlay.test.tsx`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add client/components/BeeAvatarOverlay.tsx client/components/BeeAvatarOverlay.test.tsx
git rm client/components/FairyAvatarOverlay.tsx client/components/FairyAvatarOverlay.test.tsx
git commit -m "rename: FairyAvatarOverlay -> BeeAvatarOverlay"
```

---

### Task 9: Rename remaining touch-list files (`TeamRoster`, `App.tsx`, `AgentViewportBoundsHighlights`, `AgentActionSchemas`, `sharedPlan` comment)

**Files:**
- Modify: `client/components/TeamRoster.tsx`
- Modify: `client/App.tsx`
- Modify: `client/components/highlights/AgentViewportBoundsHighlights.tsx`
- Modify: `shared/schema/AgentActionSchemas.ts:427`
- Modify: `client/agent/managers/sharedPlan.ts:13`

**Interfaces:**
- Consumes: `TldrawAgent.beeName`/`beeColor` (Task 3), `BeeAvatarOverlays` (Task 8).

- [ ] **Step 1: `TeamRoster.tsx` — rename field references**

Change:
```tsx
			<span
				className="team-roster__dot"
				style={{ backgroundColor: agent.fairyColor }}
			/>
			<span className="team-roster__name">{agent.fairyName}</span>
```
to:
```tsx
			<span
				className="team-roster__dot"
				style={{ backgroundColor: agent.beeColor }}
			/>
			<span className="team-roster__name">{agent.beeName}</span>
```

- [ ] **Step 2: `App.tsx` — rename the import and component usage**

Change:
```tsx
import { FairyAvatarOverlays } from './components/FairyAvatarOverlay'
```
to:
```tsx
import { BeeAvatarOverlays } from './components/BeeAvatarOverlay'
```

Change:
```tsx
							<TldrawAgentAppContextProvider app={app}>
								<FairyAvatarOverlays />
								<AgentViewportBoundsHighlights />
								<AllContextHighlights />
							</TldrawAgentAppContextProvider>
```
to:
```tsx
							<TldrawAgentAppContextProvider app={app}>
								<BeeAvatarOverlays />
								<AgentViewportBoundsHighlights />
								<AllContextHighlights />
							</TldrawAgentAppContextProvider>
```

- [ ] **Step 3: `AgentViewportBoundsHighlights.tsx` — rename the label string**

Change:
```tsx
				label={`${agent.fairyName}'s view`}
```
to:
```tsx
				label={`${agent.beeName}'s view`}
```

- [ ] **Step 4: `AgentActionSchemas.ts` — rename the `dispatchExecutors` description string**

Change:
```ts
	.meta({
		title: 'Dispatch Executors',
		description:
			'The Planner dispatches the Executor Fairies to start claiming and drawing Plan Items from the Shared Plan.',
	})
```
to:
```ts
	.meta({
		title: 'Dispatch Executors',
		description:
			'The Planner dispatches the Executor Bees to start claiming and drawing Plan Items from the Shared Plan.',
	})
```

- [ ] **Step 5: `sharedPlan.ts` — rename the doc comment**

Change:
```ts
/**
 * The maximum number of review rounds in a Team Mode run: the inspection after
 * the build, plus at most one fix pass. The Review Loop is hard-capped here so
 * the Fairies cannot loop forever burning time and tokens.
 */
```
to:
```ts
/**
 * The maximum number of review rounds in a Team Mode run: the inspection after
 * the build, plus at most one fix pass. The Review Loop is hard-capped here so
 * the Bees cannot loop forever burning time and tokens.
 */
```

- [ ] **Step 6: Verify no `Fairy` identifiers remain in these five files**

Run: `grep -n "Fairy" client/components/TeamRoster.tsx client/App.tsx client/components/highlights/AgentViewportBoundsHighlights.tsx shared/schema/AgentActionSchemas.ts client/agent/managers/sharedPlan.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/components/TeamRoster.tsx client/App.tsx client/components/highlights/AgentViewportBoundsHighlights.tsx shared/schema/AgentActionSchemas.ts client/agent/managers/sharedPlan.ts
git commit -m "rename: remaining fairy references in roster/app/highlights/schema/comments"
```

---

### Task 10: Rename CSS classes/keyframes in `client/index.css`

**Files:**
- Modify: `client/index.css:32-109` (the `/* Fairy */` block and its keyframes), `client/index.css:948-957` (`.fairy-sprite__pencil-hand`)

**Interfaces:**
- Produces: `.bee-sprite`, `.bee-sprite__figure`, `.bee-sprite__svg`, `.bee-sprite--idle`, `.bee-sprite--drawing`, `.bee-sprite--annoyed`, `.bee-sprite--slacking`, `.bee-sprite__wing`, `.bee-sprite__pencil-hand`, keyframes `bee-bob`, `bee-wing-flutter`, `bee-shake`, `slacking-wobble`.

- [ ] **Step 1: Replace the `/* Fairy */` block (lines 32-109)**

Change:
```css
/* Fairy */

.fairy-sprite {
	display: inline-flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	color: #111;
	transform-origin: center center;
}

.fairy-sprite__figure {
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.fairy-sprite__svg {
	display: block;
	overflow: visible;
	stroke-width: 1.75;
	transform-origin: center center;
}

.fairy-sprite--idle .fairy-sprite__figure {
	animation: fairy-bob 1.5s ease-in-out infinite;
}

.fairy-sprite--idle .fairy-sprite__wing,
.fairy-sprite--drawing .fairy-sprite__wing {
	transform-box: fill-box;
	transform-origin: center center;
	animation: fairy-wing-flutter 180ms ease-in-out infinite alternate;
}

.fairy-sprite--drawing .fairy-sprite__svg {
	transform: translateY(2px) rotate(-4deg);
}

.fairy-sprite--annoyed .fairy-sprite__figure {
	animation: fairy-shake 220ms ease-in-out infinite;
}

@keyframes fairy-bob {
	0%,
	100% {
		transform: translateY(0);
	}

	50% {
		transform: translateY(-2px);
	}
}

@keyframes fairy-wing-flutter {
	from {
		transform: rotate(-6deg) scaleY(1);
	}

	to {
		transform: rotate(6deg) scaleY(0.92);
	}
}

@keyframes fairy-shake {
	0%,
	100% {
		transform: translateX(0);
	}

	25% {
		transform: translateX(-2px);
	}

	75% {
		transform: translateX(2px);
	}
}
```
to:
```css
/* Bee */

.bee-sprite {
	display: inline-flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	color: #111;
	transform-origin: center center;
}

.bee-sprite__figure {
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.bee-sprite__svg {
	display: block;
	overflow: visible;
	stroke-width: 1.75;
	transform-origin: center center;
}

.bee-sprite--idle .bee-sprite__figure {
	animation: bee-bob 1.5s ease-in-out infinite;
}

.bee-sprite--idle .bee-sprite__wing,
.bee-sprite--drawing .bee-sprite__wing {
	transform-box: fill-box;
	transform-origin: center center;
	animation: bee-wing-flutter 180ms ease-in-out infinite alternate;
}

.bee-sprite--drawing .bee-sprite__svg {
	transform: translateY(2px) rotate(-4deg);
}

.bee-sprite--annoyed .bee-sprite__figure {
	animation: bee-shake 220ms ease-in-out infinite;
}

.bee-sprite--slacking .bee-sprite__figure {
	animation: slacking-wobble 900ms ease-in-out infinite;
}

.bee-sprite--slacking .bee-sprite__wing {
	opacity: 0.4;
}

@keyframes bee-bob {
	0%,
	100% {
		transform: translateY(0);
	}

	50% {
		transform: translateY(-2px);
	}
}

@keyframes bee-wing-flutter {
	from {
		transform: rotate(-6deg) scaleY(1);
	}

	to {
		transform: rotate(6deg) scaleY(0.92);
	}
}

@keyframes bee-shake {
	0%,
	100% {
		transform: translateX(0);
	}

	25% {
		transform: translateX(-2px);
	}

	75% {
		transform: translateX(2px);
	}
}

@keyframes slacking-wobble {
	0%,
	100% {
		transform: rotate(0deg);
	}

	50% {
		transform: rotate(-3deg);
	}
}
```

- [ ] **Step 2: Replace `.fairy-sprite__pencil-hand` block near the end of the file**

Change:
```css
/* Fairy planning animation */

.fairy-sprite__pencil-hand {
	animation: pencil-bob 0.8s ease-in-out infinite;
}

@keyframes pencil-bob {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(2px); }
}
```
to:
```css
/* Bee planning animation */

.bee-sprite__pencil-hand {
	animation: pencil-bob 0.8s ease-in-out infinite;
}

@keyframes pencil-bob {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(2px); }
}
```

Note: `BeeSprite.tsx` from Task 6 uses `bee-sprite__clipboard` for the planning accessory, not `bee-sprite__pencil-hand` — the old pencil-hand animation class has no current consumer after the sprite redesign. Leave the CSS rule renamed (not deleted) since removing unused CSS is out of scope for this rename-focused plan; it's dead code now but harmless.

- [ ] **Step 3: Verify no `fairy` string remains in the CSS file**

Run: `grep -in "fairy" client/index.css`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add client/index.css
git commit -m "rename: fairy-sprite CSS classes/keyframes -> bee-sprite, add slacking-wobble"
```

---

### Task 11: Add a `slacking` signal to `AgentRequestManager` and wire it into `BeeAvatarOverlay`

The sprite's `state` is currently derived purely from position movement (`motionState`), an `isAnnoyed` local flag (drag-hold timer), and `isGenerating`/`role` (planner-planning check) — there is no existing plumbing for a business-logic-driven state like `slacking`. This task adds that plumbing so Task 12 can flip it on/off from `ClaimItemActionUtil`.

**Files:**
- Modify: `client/agent/managers/AgentRequestManager.ts`
- Modify: `client/components/BeeAvatarOverlay.tsx`

**Interfaces:**
- Produces: `AgentRequestManager.setSlacking(value: boolean)`, `AgentRequestManager.isSlacking(): boolean`.
- Consumes (by Task 12): the same two methods, called from `ClaimItemActionUtil.applyAction`.

- [ ] **Step 1: Add the atom and accessor methods to `AgentRequestManager.ts`**

Add a new private atom alongside `$beePosition` (after the constructor's existing atom initializations):

Change:
```ts
	constructor(agent: TldrawAgent) {
		super(agent)
		this.$activeRequest = atom('activeRequest', null)
		this.$scheduledRequest = atom('scheduledRequest', null)
		this.$isPrompting = atom('isPrompting', false)
		this.$beePosition = atom('beePosition', null)
	}
```
to:
```ts
	constructor(agent: TldrawAgent) {
		super(agent)
		this.$activeRequest = atom('activeRequest', null)
		this.$scheduledRequest = atom('scheduledRequest', null)
		this.$isPrompting = atom('isPrompting', false)
		this.$beePosition = atom('beePosition', null)
		this.$isSlacking = atom('isSlacking', false)
	}
```

Add the field declaration next to `$beePosition`'s declaration:

Change:
```ts
	/**
	 * The Bee's last known page-space position.
	 * Null until the Bee first appears.
	 */
	private $beePosition: Atom<{ x: number; y: number } | null>
```
to:
```ts
	/**
	 * The Bee's last known page-space position.
	 * Null until the Bee first appears.
	 */
	private $beePosition: Atom<{ x: number; y: number } | null>

	/**
	 * Whether the Bee is currently in its "slacking" pause (WannaBee-only,
	 * see `ClaimItemActionUtil`). Drives the `slacking` sprite pose.
	 */
	private $isSlacking: Atom<boolean>
```

Add the accessor methods right after `getBeePosition()`:

Change:
```ts
	/**
	 * Get the Bee's last known page-space position.
	 */
	getBeePosition() {
		return this.$beePosition.get()
	}
```
to:
```ts
	/**
	 * Get the Bee's last known page-space position.
	 */
	getBeePosition() {
		return this.$beePosition.get()
	}

	/**
	 * Set whether the Bee is currently slacking.
	 */
	setSlacking(value: boolean) {
		this.$isSlacking.set(value)
	}

	/**
	 * Get whether the Bee is currently slacking.
	 */
	isSlacking() {
		return this.$isSlacking.get()
	}
```

- [ ] **Step 2: Reset the new atom in `reset()`**

Change:
```ts
	reset(): void {
		this.$activeRequest.set(null)
		this.$scheduledRequest.set(null)
		this.$isPrompting.set(false)
		this.cancelFn = null
	}
```
to:
```ts
	reset(): void {
		this.$activeRequest.set(null)
		this.$scheduledRequest.set(null)
		this.$isPrompting.set(false)
		this.$isSlacking.set(false)
		this.cancelFn = null
	}
```

- [ ] **Step 3: Wire the signal into `BeeAvatarOverlay.tsx`'s state derivation**

Change:
```tsx
	const isActive = useValue(
		`bee-active-${agent.id}`,
		() => agent.requests.isGenerating(),
		[agent]
	)
```
to:
```tsx
	const isActive = useValue(
		`bee-active-${agent.id}`,
		() => agent.requests.isGenerating(),
		[agent]
	)
	const isSlacking = useValue(
		`bee-slacking-${agent.id}`,
		() => agent.requests.isSlacking(),
		[agent]
	)
```

Change:
```tsx
	const plannerPlanning = agent.role === 'planner' && isActive && motionState === 'idle'
	const state: BeeState = isAnnoyed ? 'annoyed' : plannerPlanning ? 'planning' : motionState
```
to:
```tsx
	const plannerPlanning = agent.role === 'planner' && isActive && motionState === 'idle'
	const state: BeeState = isSlacking
		? 'slacking'
		: isAnnoyed
			? 'annoyed'
			: plannerPlanning
				? 'planning'
				: motionState
```

(`isSlacking` takes priority over `isAnnoyed`/`plannerPlanning` since it's driven by an explicit, intentional business event rather than incidental UI interaction — a slacking WannaBee should visibly show her slacking pose even if the user happens to be holding down a drag on her at that moment.)

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new errors introduced by this task (any remaining errors should only be in files not yet renamed — see Task 3 Step 11 note; by this point in the plan, Tasks 1-10 are done, so the only remaining `Fairy`-identifier errors should trace to `ClaimItemActionUtil.ts`, `AgentModeChart.ts`, `DispatchExecutorsActionUtil.ts`, `ChatPanel.tsx` if they reference removed names — check the specific error messages against what Tasks 9's grep already confirmed was clean, and fix anything unexpected).

- [ ] **Step 5: Commit**

```bash
git add client/agent/managers/AgentRequestManager.ts client/components/BeeAvatarOverlay.tsx
git commit -m "feat: add slacking signal to AgentRequestManager, wire into BeeAvatarOverlay"
```

---

### Task 12: Rename remaining "Executor Fairy" prompt text and `setFairyPosition` call in `AgentModeChart.ts` / `DispatchExecutorsActionUtil.ts`

These two files were flagged by the Task 9 grep as still containing `Fairy` — they weren't in that task's file list because they need care (prompt text, not just identifiers).

**Files:**
- Modify: `client/modes/AgentModeChart.ts:56,150`
- Modify: `client/actions/DispatchExecutorsActionUtil.ts:40`

**Interfaces:**
- Consumes: `AgentRequestManager.setBeePosition` (Task 3).

- [ ] **Step 1: `AgentModeChart.ts` — rename the `setFairyPosition` call in `idling.onEnter`**

Change:
```ts
					agent.requests.setFairyPosition({
```
to:
```ts
					agent.requests.setBeePosition({
```

- [ ] **Step 2: `AgentModeChart.ts` — rename the executor dispatch prompt text in `planning.onPromptEnd`**

Change:
```ts
									agentMessages: [
										'You are an Executor Fairy. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.',
									],
```
to:
```ts
									agentMessages: [
										'You are an Executor Bee. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.',
									],
```

- [ ] **Step 3: `DispatchExecutorsActionUtil.ts` — rename the same prompt text**

Change:
```ts
								agentMessages: [
									'You are an Executor Fairy. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.',
								],
```
to:
```ts
								agentMessages: [
									'You are an Executor Bee. Claim a plan item using the claimItem action and draw it inside its bounds region. When done, claim another item. Repeat until no items remain.',
								],
```

- [ ] **Step 4: Verify no `Fairy` identifiers remain in either file**

Run: `grep -in "fairy" client/modes/AgentModeChart.ts client/actions/DispatchExecutorsActionUtil.ts`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add client/modes/AgentModeChart.ts client/actions/DispatchExecutorsActionUtil.ts
git commit -m "rename: remaining Executor Fairy prompt text and setFairyPosition call"
```

---

### Task 13: `ChatPanel.tsx` — Beeyonce's planner prompt, MacBee's voice, and the WannaBee grumble line

This is the prompt-only piece of the spec: no new detection code, just system-prompt text that gives the planner (Beeyonce) her queen-bee identity, tells her to narrate MacBee with a Scottish-inflected voice, and tells her to grumble narratively if WannaBee is slacking.

**Files:**
- Modify: `client/components/ChatPanel.tsx:30-64`

**Interfaces:**
- Consumes: `TldrawAgent.beeName` (Task 3), `EXECUTOR_BEE_NAMES`/`PLANNER_BEE_NAME` (Task 5, for reference only — this file builds its own prompt string and doesn't need to import them since it already reads names off the live agent objects via `e.beeName`).

- [ ] **Step 1: Rename `fairyName` to `beeName` in the executor-name-listing line**

Change:
```tsx
					const executorNames = executors.map((e) => e.fairyName).join(' and ')
```
to:
```tsx
					const executorNames = executors.map((e) => e.beeName).join(' and ')
```

- [ ] **Step 2: Rewrite the planner prompt string**

Change:
```tsx
				planner.interrupt({
					input: {
						agentMessages: [
							`You are the Planner Fairy. Workers: ${executorNames}. Voice: dry wit, deadpan, child-friendly. No puns.

You MUST emit these actions in this EXACT order:
1. message (MAX 2 sentences: what you'll draw + who does what)
2. writePlan (the actual plan items with coordinates)
3. dispatchExecutors

The message action MUST be short. Put ALL detail into writePlan items, not the message.

Each writePlan item needs: text (what to draw), x, y, w, h (canvas region).

${positioningRule}

User request: ${value}`,
						],
						userMessages: [value],
						bounds: planner.editor.getViewportPageBounds(),
						source: 'user',
						contextItems: agent.context.getItems(),
					},
				})
```
to:
```tsx
				planner.interrupt({
					input: {
						agentMessages: [
							`You are Beeyonce, the Queen Bee planner. Workers: ${executorNames}. Voice: dry wit, deadpan, child-friendly. No puns.

If you narrate MacBee's work, give MacBee a Scottish-inflected, provocative turn of phrase. If WannaBee appears to be pausing or slow to finish her claimed item, react with mild exasperation/grumbling about her slacking, in your own dry voice — don't invent new mechanics, just narrate it.

You MUST emit these actions in this EXACT order:
1. message (MAX 2 sentences: what you'll draw + who does what)
2. writePlan (the actual plan items with coordinates)
3. dispatchExecutors

The message action MUST be short. Put ALL detail into writePlan items, not the message.

Each writePlan item needs: text (what to draw), x, y, w, h (canvas region).

${positioningRule}

User request: ${value}`,
						],
						userMessages: [value],
						bounds: planner.editor.getViewportPageBounds(),
						source: 'user',
						contextItems: agent.context.getItems(),
					},
				})
```

- [ ] **Step 3: Verify no `Fairy` identifiers remain**

Run: `grep -in "fairy" client/components/ChatPanel.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add client/components/ChatPanel.tsx
git commit -m "feat: Beeyonce planner voice, MacBee Scottish narration, WannaBee grumble line"
```

---

### Task 14: WannaBee's slacking mechanic in `ClaimItemActionUtil.ts`

The core behavioral mechanic: after WannaBee claims a plan item, 25% of the time she enters the `slacking` state for a real 2-4 second pause before the draw prompt is scheduled. Gated strictly on `this.agent.beeName === 'WannaBee'` — no other executor is affected.

**Files:**
- Modify: `client/actions/ClaimItemActionUtil.ts`
- Create: `client/actions/ClaimItemActionUtil.test.ts`

**Interfaces:**
- Consumes: `AgentRequestManager.setSlacking` (Task 11), `TldrawAgent.beeName` (Task 3).
- Produces: exported `WANNABEE_SLACK_CHANCE = 0.25`, `WANNABEE_SLACK_MIN_MS = 2000`, `WANNABEE_SLACK_MAX_MS = 4000`, and a testable pure helper `shouldSlack(beeName: string, roll: number): boolean` so the probability logic is unit-testable without mocking `Math.random` inside the action util itself.

- [ ] **Step 1: Write the failing test first**

```ts
// client/actions/ClaimItemActionUtil.test.ts
import { describe, expect, test } from 'bun:test'
import {
	getSlackDurationMs,
	shouldSlack,
	WANNABEE_SLACK_CHANCE,
	WANNABEE_SLACK_MAX_MS,
	WANNABEE_SLACK_MIN_MS,
} from './ClaimItemActionUtil'

describe('shouldSlack', () => {
	test('never slacks for any bee other than WannaBee, regardless of roll', () => {
		expect(shouldSlack('MacBee', 0)).toBe(false)
		expect(shouldSlack('Beeyonce', 0)).toBe(false)
		expect(shouldSlack('Chairman Meow', 0)).toBe(false)
	})

	test('WannaBee slacks when the roll is below the configured chance', () => {
		expect(shouldSlack('WannaBee', 0)).toBe(true)
		expect(shouldSlack('WannaBee', WANNABEE_SLACK_CHANCE - 0.001)).toBe(true)
	})

	test('WannaBee does not slack when the roll is at or above the configured chance', () => {
		expect(shouldSlack('WannaBee', WANNABEE_SLACK_CHANCE)).toBe(false)
		expect(shouldSlack('WannaBee', 0.999)).toBe(false)
	})
})

describe('getSlackDurationMs', () => {
	test('maps roll=0 to the minimum duration', () => {
		expect(getSlackDurationMs(0)).toBe(WANNABEE_SLACK_MIN_MS)
	})

	test('maps roll close to 1 to just under the maximum duration', () => {
		const duration = getSlackDurationMs(0.999999)
		expect(duration).toBeGreaterThanOrEqual(WANNABEE_SLACK_MIN_MS)
		expect(duration).toBeLessThan(WANNABEE_SLACK_MAX_MS)
	})

	test('maps roll=0.5 to the midpoint duration', () => {
		expect(getSlackDurationMs(0.5)).toBe((WANNABEE_SLACK_MIN_MS + WANNABEE_SLACK_MAX_MS) / 2)
	})
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test client/actions/ClaimItemActionUtil.test.ts`
Expected: FAIL — `shouldSlack`, `getSlackDurationMs`, `WANNABEE_SLACK_CHANCE`, `WANNABEE_SLACK_MIN_MS`, `WANNABEE_SLACK_MAX_MS` are not exported from `./ClaimItemActionUtil` yet.

- [ ] **Step 3: Implement the minimal code to make the test pass**

Rewrite `client/actions/ClaimItemActionUtil.ts`:

```ts
import { ClaimItemAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppPlanManager } from '../agent/managers/AgentAppPlanManager'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/** The chance, per claim, that WannaBee enters her slacking pause. */
export const WANNABEE_SLACK_CHANCE = 0.25

/** The minimum and maximum real pause duration for WannaBee's slacking state. */
export const WANNABEE_SLACK_MIN_MS = 2000
export const WANNABEE_SLACK_MAX_MS = 4000

/**
 * Whether a bee should enter the slacking state on this claim.
 * Only ever true for WannaBee — every other bee (including future executors)
 * never slacks. `roll` is a caller-supplied random value in [0, 1) so this
 * stays a pure, testable function rather than reaching for `Math.random()`
 * itself.
 */
export function shouldSlack(beeName: string, roll: number): boolean {
	if (beeName !== 'WannaBee') return false
	return roll < WANNABEE_SLACK_CHANCE
}

/**
 * Maps a random roll in [0, 1) to a slack duration in
 * [WANNABEE_SLACK_MIN_MS, WANNABEE_SLACK_MAX_MS).
 */
export function getSlackDurationMs(roll: number): number {
	return WANNABEE_SLACK_MIN_MS + roll * (WANNABEE_SLACK_MAX_MS - WANNABEE_SLACK_MIN_MS)
}

export const ClaimItemActionUtil = registerActionUtil(
	class ClaimItemActionUtil extends AgentActionUtil<ClaimItemAction> {
		static override type = 'claimItem' as const

		override getInfo(action: Streaming<ClaimItemAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Claimed a plan item' : 'Claiming a plan item...',
			}
		}

		override async applyAction(action: Streaming<ClaimItemAction>, _helpers: AgentHelpers) {
			if (!action.complete) return

			const claimed = AgentAppPlanManager.claim(this.editor, this.agent.id)
			if (!claimed) return

			if (shouldSlack(this.agent.beeName, Math.random())) {
				this.agent.requests.setSlacking(true)
				await new Promise((resolve) => setTimeout(resolve, getSlackDurationMs(Math.random())))
				this.agent.requests.setSlacking(false)
			}

			if (claimed.bounds) {
				this.agent.schedule({
					bounds: claimed.bounds,
					agentMessages: [
						`Draw "${claimed.text}" inside region x=${claimed.bounds.x} y=${claimed.bounds.y} w=${claimed.bounds.w} h=${claimed.bounds.h}. Use many shapes with color and fills. No text labels.`,
					],
				})
			} else {
				this.agent.schedule({
					agentMessages: [
						`Draw "${claimed.text}". Use many shapes with color and fills. No text labels.`,
					],
				})
			}
		}
	},
	{ forModes: ['executing'] }
)
```

Note: `applyAction` was previously synchronous (`void`-returning); making it `async` is safe here — `AgentActionManager.act()` (in `client/agent/managers/AgentActionManager.ts:105`) already does `promise = util.applyAction(...) ?? null` and separately awaits `Promise.all(actionPromises)` in `TldrawAgent.ts`'s `requestAgentActions`, so an `applyAction` that returns a `Promise<void>` was already a supported return type (see `CountryInfoActionUtil.ts` for an existing precedent of `override async applyAction`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test client/actions/ClaimItemActionUtil.test.ts`
Expected: `6 pass`, `0 fail`.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `ClaimItemActionUtil.ts` or `beeName`/`setSlacking`.

- [ ] **Step 6: Commit**

```bash
git add client/actions/ClaimItemActionUtil.ts client/actions/ClaimItemActionUtil.test.ts
git commit -m "feat: WannaBee slacking mechanic on claimItem (25% chance, 2-4s pause)"
```

---

### Task 15: Full-repo verification pass

Final gate before this branch is ready for review: confirm no stray `Fairy` identifiers remain (outside the intentionally-kept `generateFairyName.ts`), the whole test suite passes, types check clean, and the production build succeeds.

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm no unintended `Fairy`/`fairy` references remain**

Run: `grep -rniI "fairy" client/ shared/ worker/ server/ --include="*.ts" --include="*.tsx" --include="*.css"`
Expected: every hit is inside `client/utils/generateFairyName.ts` or `client/utils/generateFairyName.test.ts` (Solo Mode's intentionally-unrenamed joke-name pool) — no other file appears.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`
Expected: all tests pass, including every renamed/new test file from Tasks 2, 6, 8, 14 plus the untouched `generateFairyName.test.ts` and `sharedPlan.test.ts`. No failures.

- [ ] **Step 3: Type-check the whole project**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: build succeeds (this is a Vite app — a successful build is a stronger signal than `tsc --noEmit` alone since Vite/esbuild will also catch anything `tsc`'s `--noEmit` mode might not, such as unresolved imports at bundle time).

- [ ] **Step 5: Manual smoke check reminder (not automatable in this plan)**

This plan cannot start a browser session. Before merging, run `bun run dev` (or `bun run dev:local` if testing the local-model backend) and manually verify in-browser: Team Mode spawns Beeyonce (crown+sash, round yellow/black body) as planner, MacBee (head+abdomen, white/blue Saltire stripes) and WannaBee (round yellow/black body) as executors, and that WannaBee occasionally shows the slacking pose (phone/duck-lips) for a few seconds after claiming an item before she starts drawing. Note this in the PR description as a manual verification step, since no test in this plan renders the live Team Mode flow end-to-end.

- [ ] **Step 6: No commit for this task** (verification only, nothing to stage)

---

## Self-Review

**Spec coverage:**
- Fixed team assignment (Beeyonce=planner, MacBee=executor0, WannaBee=executor1) — Task 5. ✅
- Solo Mode keeps `generateFairyName()`/old pool untouched — Tasks 4 and 15 both explicitly verify this stays true. ✅
- Sprite design (round body for Beeyonce/WannaBee, head+abdomen Saltire for MacBee, crown+sash, slacking pose) — Task 6. ✅
- `slacking` FairyState/BeeState addition — Task 1. ✅
- WannaBee slacking mechanic (name-gated, 25% chance, 2-4s real pause) — Tasks 11 (plumbing) and 14 (mechanic). ✅
- Beeyonce's grumble reaction (prompt-only) — Task 13. ✅
- MacBee's voice (prompt-only) — Task 13. ✅
- Full mechanical rename list from the spec — Tasks 1-3, 4, 5, 6, 7, 8, 9, 10, 12, 13 collectively cover every file in the spec's "Rename scope (mechanical)" section. ✅
- `generateFairyName.ts` explicitly NOT renamed — confirmed untouched throughout, verified in Task 15. ✅
- Debug-work-on-main separation — already resolved before this plan was written (commit `a0be982`), out of scope for this plan. N/A here by design.

**Placeholder scan:** No "TBD"/"TODO"/"handle appropriately" found in any step above — every step has literal code, exact grep commands, or exact file diffs.

**Type consistency:** `BeeState` (Task 1) is consumed identically in Task 6 (`BeeSprite`) and Task 8 (`BeeAvatarOverlay`) — same 5 values. `BeePosition`/`getBeePositionFromBounds`/`extractBeePosition`/`extractBeePositionFromDiff`/`getDefaultBeeSpawnPosition`/`getTeamBeeSpawnPosition` (Task 2) are consumed with matching signatures in Tasks 3, 4, 5. `AgentRequestManager.setBeePosition`/`getBeePosition` (Task 3) and `setSlacking`/`isSlacking` (Task 11) are called with matching names in Tasks 4, 5, 8, 9, 12, 14. `TldrawAgent.beeName`/`beeColor` (Task 3) match `CreateAgentOptions.beeName`/`beeColor` (Task 4) and every consumer in Tasks 5, 8, 9, 13, 14.


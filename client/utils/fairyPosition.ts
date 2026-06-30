import { FocusedShape } from '../../shared/format/FocusedShape'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'

export type FairyPosition = { x: number; y: number }
type BoundsLike = { x: number; y: number; w: number; h: number }
type ShapeRecordLike = { id: string; typeName: string }
type ShapeDiffLike = {
	added: Record<string, ShapeRecordLike>
	updated: Record<string, [ShapeRecordLike, ShapeRecordLike]>
}
type FairyBoundsPlacement = 'center' | 'resting'

const FAIRY_RESTING_OFFSET_SCREEN_PX = 48

export function getDefaultFairySpawnPosition(
	viewportBounds: {
		x: number
		y: number
		w: number
		h: number
	},
	index = 0
): FairyPosition {
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

export function getTeamFairySpawnPosition(
	viewportBounds: { x: number; y: number; w: number; h: number },
	roleIndex: number
): FairyPosition {
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

export function extractFairyPositionFromDiff(
	diff: ShapeDiffLike,
	getShapePageBounds: (shapeId: string) => BoundsLike | null | undefined,
	options: { placement?: FairyBoundsPlacement; zoomLevel?: number } = {}
): FairyPosition | null {
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

	return getFairyPositionFromBounds(bounds, options.placement ?? 'center', options.zoomLevel)
}

export function getFairyPositionFromBounds(
	bounds: BoundsLike,
	placement: FairyBoundsPlacement,
	zoomLevel = 1
): FairyPosition {
	if (placement === 'resting') {
		const pageOffset = FAIRY_RESTING_OFFSET_SCREEN_PX / (zoomLevel > 0 ? zoomLevel : 1)
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

export function extractFairyPosition(
	action: Streaming<AgentAction>,
	normalize?: (position: FairyPosition) => FairyPosition
): FairyPosition | null {
	let position: FairyPosition | null

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

function getFocusedShapeCentroid(shape: Partial<FocusedShape>): FairyPosition | null {
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

function getPointsBoundsCenter(points: Array<{ x: number; y: number }> | undefined): FairyPosition | null {
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

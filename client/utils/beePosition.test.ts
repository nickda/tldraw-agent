import { describe, expect, test } from 'bun:test'
import {
	extractBeePosition,
	extractBeePositionFromDiff,
	getDefaultBeeSpawnPosition,
	getBeePositionFromBounds,
} from './beePosition'

describe('extractBeePosition', () => {
	const normalizeFromChatOrigin = ({ x, y }: { x: number; y: number }) => ({
		x: x + 100,
		y: y + 200,
	})

	test('returns the center of a geo shape created by the agent', () => {
		expect(
			extractBeePosition({
				_type: 'create',
				complete: true,
				time: 0,
				intent: 'Create a rectangle',
				shape: {
					_type: 'rectangle',
					color: 'black',
					fill: 'none',
					h: 40,
					note: '',
					shapeId: 'shape-1',
					w: 80,
					x: 10,
					y: 20,
				},
			})
		).toEqual({ x: 50, y: 40 })
	})

	test('normalizes a created shape position to page space', () => {
		expect(
			extractBeePosition(
				{
					_type: 'create',
					complete: true,
					time: 0,
					intent: 'Create a rectangle',
					shape: {
						_type: 'rectangle',
						color: 'black',
						fill: 'none',
						h: 40,
						note: '',
						shapeId: 'shape-1',
						w: 80,
						x: 10,
						y: 20,
					},
				},
				normalizeFromChatOrigin
			)
		).toEqual({ x: 150, y: 240 })
	})

	test('returns the midpoint of a created line', () => {
		expect(
			extractBeePosition({
				_type: 'create',
				complete: true,
				time: 0,
				intent: 'Create a line',
				shape: {
					_type: 'line',
					color: 'black',
					note: '',
					shapeId: 'shape-1',
					x1: 10,
					x2: 30,
					y1: 20,
					y2: 60,
				},
			})
		).toEqual({ x: 20, y: 40 })
	})

	test('returns the move target coordinates', () => {
		expect(
			extractBeePosition({
				_type: 'move',
				anchor: 'center',
				complete: true,
				intent: 'Move shape',
				shapeId: 'shape-1',
				time: 0,
				x: 120,
				y: 240,
			})
		).toEqual({ x: 120, y: 240 })
	})

	test('normalizes move target coordinates to page space', () => {
		expect(
			extractBeePosition(
				{
					_type: 'move',
					anchor: 'center',
					complete: true,
					intent: 'Move shape',
					shapeId: 'shape-1',
					time: 0,
					x: 120,
					y: 240,
				},
				normalizeFromChatOrigin
			)
		).toEqual({ x: 220, y: 440 })
	})

	test('returns the bounds center of a pen stroke', () => {
		expect(
			extractBeePosition({
				_type: 'pen',
				closed: false,
				color: 'black',
				complete: true,
				fill: 'none',
				intent: 'Draw stroke',
				points: [
					{ x: 10, y: 20 },
					{ x: 50, y: 80 },
					{ x: 30, y: 40 },
				],
				shapeId: 'shape-1',
				style: 'smooth',
				time: 0,
			})
		).toEqual({ x: 30, y: 50 })
	})

	test('normalizes pen stroke bounds center to page space', () => {
		expect(
			extractBeePosition(
				{
					_type: 'pen',
					closed: false,
					color: 'black',
					complete: true,
					fill: 'none',
					intent: 'Draw stroke',
					points: [
						{ x: 10, y: 20 },
						{ x: 50, y: 80 },
						{ x: 30, y: 40 },
					],
					shapeId: 'shape-1',
					style: 'smooth',
					time: 0,
				},
				normalizeFromChatOrigin
			)
		).toEqual({ x: 130, y: 250 })
	})

	test('returns null for non-spatial actions', () => {
		expect(
			extractBeePosition({
				_type: 'think',
				complete: true,
				text: 'Thinking',
				time: 0,
			})
		).toBeNull()
	})

	test('returns null for draw shapes because pen-stroke position is tracked via diff bounds', () => {
		expect(
			extractBeePosition({
				_type: 'create',
				complete: true,
				time: 0,
				intent: 'Draw',
				shape: {
					_type: 'draw',
					color: 'black',
					note: '',
					shapeId: 'shape-1' as any,
				},
			})
		).toBeNull()
	})

	test('returns null for setMyView because camera movement is not drawing position', () => {
		expect(
			extractBeePosition({
				_type: 'setMyView',
				complete: true,
				h: 40,
				intent: 'Look over here',
				time: 0,
				w: 80,
				x: 100,
				y: 200,
			})
		).toBeNull()
	})

	test('returns null for align because the action payload has no coordinates', () => {
		expect(
			extractBeePosition({
				_type: 'align',
				alignment: 'top',
				complete: true,
				gap: 0,
				intent: 'Align shapes',
				shapeIds: ['shape-1', 'shape-2'],
				time: 0,
			})
		).toBeNull()
	})
})

describe('extractBeePositionFromDiff', () => {
	test('returns null when diff is empty', () => {
		expect(
			extractBeePositionFromDiff({ added: {}, updated: {} }, () => ({ x: 0, y: 0, w: 10, h: 10 }))
		).toBeNull()
	})

	test('returns null when getShapePageBounds returns null', () => {
		expect(
			extractBeePositionFromDiff(
				{ added: { 'shape:x': { id: 'shape:x', typeName: 'shape' } }, updated: {} },
				() => null
			)
		).toBeNull()
	})

	test('returns the center of the last changed editor shape bounds', () => {
		expect(
			extractBeePositionFromDiff(
				{
					added: {
						'shape:dot-1': { id: 'shape:dot-1', typeName: 'shape' },
					},
					updated: {},
				},
				(shapeId) => {
					if (shapeId !== 'shape:dot-1') return null
					return { x: 140, y: 60, w: 20, h: 20 }
				}
			)
		).toEqual({ x: 150, y: 70 })
	})

	test('ignores non-shape diffs', () => {
		expect(
			extractBeePositionFromDiff(
				{
					added: {
						'instance:camera': { id: 'instance:camera', typeName: 'instance' },
					},
					updated: {},
				},
				() => ({ x: 0, y: 0, w: 10, h: 10 })
			)
		).toBeNull()
	})

	test('returns a resting position outside the changed shape bounds', () => {
		expect(
			extractBeePositionFromDiff(
				{
					added: {
						'shape:dot-1': { id: 'shape:dot-1', typeName: 'shape' },
					},
					updated: {},
				},
				() => ({ x: 140, y: 60, w: 20, h: 20 }),
				{ placement: 'resting' }
			)
		).toEqual({ x: 208, y: 128 })
	})

	test('scales resting offset by zoom level', () => {
		// bounds {x:140, y:60, w:20, h:20}, zoom=0.5 → pageOffset=96 → x=140+20+96=256, y=60+20+96=176
		expect(
			extractBeePositionFromDiff(
				{
					added: {
						'shape:dot-1': { id: 'shape:dot-1', typeName: 'shape' },
					},
					updated: {},
				},
				() => ({ x: 140, y: 60, w: 20, h: 20 }),
				{ placement: 'resting', zoomLevel: 0.5 }
			)
		).toEqual({ x: 256, y: 176 })
	})
})

describe('getBeePositionFromBounds', () => {
	test('returns either the bounds center or a resting position outside the bounds', () => {
		const bounds = { x: 10, y: 20, w: 80, h: 40 }

		expect(getBeePositionFromBounds(bounds, 'center')).toEqual({ x: 50, y: 40 })
		expect(getBeePositionFromBounds(bounds, 'resting')).toEqual({ x: 138, y: 108 })
	})

	test('falls back to zoom=1 when zoom is 0 to avoid Infinity position', () => {
		const bounds = { x: 10, y: 20, w: 80, h: 40 }
		expect(getBeePositionFromBounds(bounds, 'resting', 0)).toEqual({ x: 138, y: 108 })
	})

	test('scales resting offset by zoom level so clearance stays constant in screen space', () => {
		const bounds = { x: 10, y: 20, w: 80, h: 40 }
		// zoom=0.5 → pageOffset = 48/0.5 = 96
		expect(getBeePositionFromBounds(bounds, 'resting', 0.5)).toEqual({ x: 186, y: 156 })
		// zoom=2 → pageOffset = 48/2 = 24
		expect(getBeePositionFromBounds(bounds, 'resting', 2)).toEqual({ x: 114, y: 84 })
		// zoom=1 (default) unchanged
		expect(getBeePositionFromBounds(bounds, 'resting', 1)).toEqual({ x: 138, y: 108 })
	})
})

describe('getDefaultBeeSpawnPosition', () => {
	test('returns the viewport center', () => {
		expect(
			getDefaultBeeSpawnPosition({
				x: 40,
				y: 80,
				w: 200,
				h: 120,
			})
		).toEqual({ x: 140, y: 140 })
	})

	test('spreads later spawn positions around the center', () => {
		expect(
			getDefaultBeeSpawnPosition({
				x: 40,
				y: 80,
				w: 200,
				h: 120,
			}, 1)
		).toEqual({ x: 220, y: 140 })

		expect(
			getDefaultBeeSpawnPosition({
				x: 40,
				y: 80,
				w: 200,
				h: 120,
			}, 2)
		).toEqual({ x: 140, y: 220 })
	})
})

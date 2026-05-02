import { describe, expect, test } from 'bun:test'
import { extractFairyPosition } from './fairyPosition'

describe('extractFairyPosition', () => {
	const normalizeFromChatOrigin = ({ x, y }: { x: number; y: number }) => ({
		x: x + 100,
		y: y + 200,
	})

	test('returns the center of a geo shape created by the agent', () => {
		expect(
			extractFairyPosition({
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
			extractFairyPosition(
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
			extractFairyPosition({
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
			extractFairyPosition({
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
			extractFairyPosition(
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
			extractFairyPosition({
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
			extractFairyPosition(
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

	test('returns the viewport center for setMyView', () => {
		expect(
			extractFairyPosition({
				_type: 'setMyView',
				complete: true,
				h: 40,
				intent: 'Look over here',
				time: 0,
				w: 80,
				x: 100,
				y: 200,
			})
		).toEqual({ x: 140, y: 220 })
	})

	test('normalizes the viewport center for setMyView to page space', () => {
		expect(
			extractFairyPosition(
				{
					_type: 'setMyView',
					complete: true,
					h: 40,
					intent: 'Look over here',
					time: 0,
					w: 80,
					x: 100,
					y: 200,
				},
				normalizeFromChatOrigin
			)
		).toEqual({ x: 240, y: 420 })
	})

	test('returns null for non-spatial actions', () => {
		expect(
			extractFairyPosition({
				_type: 'think',
				complete: true,
				text: 'Thinking',
				time: 0,
			})
		).toBeNull()
	})

	test('returns null for align because the action payload has no coordinates', () => {
		expect(
			extractFairyPosition({
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

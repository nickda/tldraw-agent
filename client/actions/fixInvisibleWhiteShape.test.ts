import { describe, expect, test } from 'bun:test'
import { fixInvisibleWhiteShape } from './fixInvisibleWhiteShape'

describe('fixInvisibleWhiteShape', () => {
	test('rewrites a white solid geo shape to background + grey', () => {
		const shape = { _type: 'ellipse', color: 'white', fill: 'solid', w: 100, h: 100 }
		fixInvisibleWhiteShape(shape)
		expect(shape.color).toBe('grey')
		expect(shape.fill).toBe('background')
	})

	test('rewrites white none and white tint too', () => {
		const none = { _type: 'rectangle', color: 'white', fill: 'none' }
		fixInvisibleWhiteShape(none)
		expect(none).toEqual({ _type: 'rectangle', color: 'grey', fill: 'background' })

		const tint = { _type: 'rectangle', color: 'white', fill: 'tint' }
		fixInvisibleWhiteShape(tint)
		expect(tint).toEqual({ _type: 'rectangle', color: 'grey', fill: 'background' })
	})

	test('leaves a white shape already using background fill untouched', () => {
		const shape = { _type: 'ellipse', color: 'white', fill: 'background' }
		fixInvisibleWhiteShape(shape)
		expect(shape.color).toBe('white')
		expect(shape.fill).toBe('background')
	})

	test('leaves white text untouched (white text is often intentional)', () => {
		const shape = { _type: 'text', color: 'white', fill: 'solid' }
		fixInvisibleWhiteShape(shape)
		expect(shape.color).toBe('white')
		expect(shape.fill).toBe('solid')
	})

	test('leaves non-white shapes untouched', () => {
		const shape = { _type: 'ellipse', color: 'blue', fill: 'solid' }
		fixInvisibleWhiteShape(shape)
		expect(shape.color).toBe('blue')
		expect(shape.fill).toBe('solid')
	})

	test('is a no-op for an undefined shape', () => {
		expect(fixInvisibleWhiteShape(undefined as any)).toBeUndefined()
	})
})

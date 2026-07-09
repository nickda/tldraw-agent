import { describe, expect, mock, test } from 'bun:test'
import {
	convertFocusedShapeToTldrawShape,
	convertPartialFocusedShapeToTldrawShape,
} from './convertFocusedShapeToTldrawShape'
import { FocusedTextShape } from './FocusedShape'

/**
 * Minimal editor stub for convertFocusedShapeToTldrawShape's text path.
 * getShapePageBounds is a spy: getDummyBounds returns early from it whenever
 * it resolves to a truthy box, so this stub never needs the
 * store.extractingChanges/createShape dummy-shape dance the real editor uses
 * as a fallback.
 */
function makeEditor(boundsSpy = mock(() => ({ x: 0, y: 0, w: 40, h: 20 }))) {
	const editor = {
		getHighestIndexForParent: () => 'a1',
		getCurrentPageId: () => 'page:page',
		getShapePageBounds: boundsSpy,
	} as any
	return { editor, boundsSpy }
}

function textShape(overrides: Partial<FocusedTextShape>): FocusedTextShape {
	return {
		_type: 'text',
		anchor: 'top-left',
		color: 'black',
		maxWidth: null,
		note: '',
		shapeId: 'text1' as any,
		text: 'hello',
		x: 10,
		y: 20,
		...overrides,
	}
}

describe('convertFocusedShapeToTldrawShape: text anchor positioning', () => {
	test('center anchor uses the same defaulted x/y as every other anchor (no NaN when x/y absent)', () => {
		const { editor } = makeEditor()
		const partial = { ...textShape({ anchor: 'center' }) }
		delete (partial as any).x
		delete (partial as any).y

		const { shape } = convertFocusedShapeToTldrawShape(editor, partial, {
			defaultShape: { x: 100, y: 200 },
		})

		expect(Number.isNaN(shape.x)).toBe(false)
		expect(Number.isNaN(shape.y)).toBe(false)
		expect(shape.x).toBe(100 - 40 / 2)
		expect(shape.y).toBe(200 - 20 / 2)
	})

	test('center anchor offsets by half the bounds around the provided x/y, same as top-center', () => {
		const { editor } = makeEditor()
		const center = convertFocusedShapeToTldrawShape(editor, textShape({ anchor: 'center' }), {
			defaultShape: {},
		}).shape
		const topCenter = convertFocusedShapeToTldrawShape(
			editor,
			textShape({ anchor: 'top-center' }),
			{ defaultShape: {} }
		).shape

		expect(center.x).toBe(topCenter.x)
		expect(center.y).toBe(20 - 20 / 2)
	})
})

describe('convertFocusedShapeToTldrawShape: bounds measurement is lazy', () => {
	test('top-left never measures bounds, since it needs neither width nor height', () => {
		const { editor, boundsSpy } = makeEditor()
		convertFocusedShapeToTldrawShape(editor, textShape({ anchor: 'top-left' }), {
			defaultShape: {},
		})
		expect(boundsSpy).not.toHaveBeenCalled()
	})

	test('top-center measures bounds exactly once, not once per coordinate', () => {
		const { editor, boundsSpy } = makeEditor()
		convertFocusedShapeToTldrawShape(editor, textShape({ anchor: 'top-center' }), {
			defaultShape: {},
		})
		expect(boundsSpy).toHaveBeenCalledTimes(1)
	})

	test('center (needs both width and height) still measures bounds only once, via caching', () => {
		const { editor, boundsSpy } = makeEditor()
		convertFocusedShapeToTldrawShape(editor, textShape({ anchor: 'center' }), {
			defaultShape: {},
		})
		expect(boundsSpy).toHaveBeenCalledTimes(1)
	})
})

describe('convertPartialFocusedShapeToTldrawShape: streaming shape id scoping', () => {
	test('two concurrent streaming updates without an explicit id, given distinct fallback ids, never collide', () => {
		const { editor } = makeEditor()
		const agentAPartial = { _type: 'text', x: 0, y: 0, text: 'from agent A' } as any
		const agentBPartial = { _type: 'text', x: 0, y: 0, text: 'from agent B' } as any

		const resultA = convertPartialFocusedShapeToTldrawShape(editor, agentAPartial, {
			defaultShape: {},
			complete: false,
			fallbackShapeId: 'streaming-shape-agentA' as any,
		})
		const resultB = convertPartialFocusedShapeToTldrawShape(editor, agentBPartial, {
			defaultShape: {},
			complete: false,
			fallbackShapeId: 'streaming-shape-agentB' as any,
		})

		expect(resultA.shape?.id).not.toBe(resultB.shape?.id)
	})

	test('falls back to a shared id when no fallbackShapeId is given (single-agent behavior unchanged)', () => {
		const { editor } = makeEditor()
		const partial = { _type: 'text', x: 0, y: 0, text: 'hi' } as any
		const result = convertPartialFocusedShapeToTldrawShape(editor, partial, {
			defaultShape: {},
			complete: false,
		})
		expect(result.shape?.id).toBe('shape:streaming-shape')
	})
})

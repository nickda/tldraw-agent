import { describe, expect, test } from 'bun:test'
import { convertTldrawShapeToFocusedShape } from './convertTldrawShapeToFocusedShape'

/**
 * Minimal editor stub covering only what convertTldrawShapeToFocusedShape needs:
 * getShapeUtil().getText() for label-bearing shapes, and store.query.records for
 * arrow bindings. Shapes are given explicit props.w/h so getSimpleBounds never
 * falls through to the mock-shape-creation path (which needs a real store).
 */
function makeEditor({
	text = '',
	bindings = [] as any[],
}: { text?: string; bindings?: any[] } = {}) {
	return {
		getShapeUtil: () => ({ getText: () => text }),
		// Used only as a dimensions fallback for shapes without props.w/h (line, arrow).
		getShapePageBounds: () => ({ w: 0, h: 0 }),
		store: {
			query: {
				records: () => ({ get: () => bindings }),
			},
		},
	} as any
}

describe('convertTldrawShapeToFocusedShape: arrow label round-trip', () => {
	test('reads the label from props.richText via getText, not meta.text', () => {
		const editor = makeEditor({ text: 'ship it' })
		const shape = {
			id: 'shape:arrow1',
			type: 'arrow',
			x: 0,
			y: 0,
			parentId: 'page:page',
			meta: { text: 'stale-value-from-a-different-property' },
			props: {
				bend: 0,
				start: { x: 0, y: 0 },
				end: { x: 100, y: 0 },
				color: 'black',
			},
		} as any

		const focused = convertTldrawShapeToFocusedShape(editor, shape)

		expect(focused._type).toBe('arrow')
		expect((focused as any).text).toBe('ship it')
	})

	test('reports an empty label when the arrow has no text', () => {
		const editor = makeEditor({ text: '' })
		const shape = {
			id: 'shape:arrow2',
			type: 'arrow',
			x: 0,
			y: 0,
			parentId: 'page:page',
			meta: {},
			props: {
				bend: 0,
				start: { x: 0, y: 0 },
				end: { x: 100, y: 0 },
				color: 'black',
			},
		} as any

		const focused = convertTldrawShapeToFocusedShape(editor, shape)
		expect((focused as any).text).toBe('')
	})
})

describe('convertTldrawShapeToFocusedShape: line points', () => {
	function lineShape(points: Record<string, { id: string; index: string; x: number; y: number }>) {
		return {
			id: 'shape:line1',
			type: 'line',
			x: 10,
			y: 20,
			parentId: 'page:page',
			meta: {},
			props: { color: 'black', points },
		} as any
	}

	test('a two-point line reports both endpoints unmodified', () => {
		const editor = makeEditor()
		const shape = lineShape({
			a1: { id: 'a1', index: 'a1', x: 0, y: 0 },
			a2: { id: 'a2', index: 'a2', x: 50, y: 0 },
		})

		const focused = convertTldrawShapeToFocusedShape(editor, shape) as any
		expect(focused.x1).toBe(10)
		expect(focused.y1).toBe(20)
		expect(focused.x2).toBe(60)
		expect(focused.y2).toBe(20)
	})

	test('a line with 3+ points is not silently truncated to the first two: it reports the true first and last point', () => {
		const editor = makeEditor()
		// Deliberately out of index order to also exercise the sortByIndex fix.
		const shape = lineShape({
			a2: { id: 'a2', index: 'a2', x: 50, y: 0 },
			a3: { id: 'a3', index: 'a3', x: 100, y: 50 },
			a1: { id: 'a1', index: 'a1', x: 0, y: 0 },
		})

		const focused = convertTldrawShapeToFocusedShape(editor, shape) as any
		// First point (a1) and last point (a3), not a1/a2.
		expect(focused.x1).toBe(10)
		expect(focused.y1).toBe(20)
		expect(focused.x2).toBe(110)
		expect(focused.y2).toBe(70)
		// The simplification is called out, not silent.
		expect(focused.note).toContain('3 points')
	})
})

describe('convertTldrawShapeToFocusedShape: unknown shapes report extent', () => {
	test('a frame-like shape with props.w/h reports width and height', () => {
		const editor = makeEditor()
		const shape = {
			id: 'shape:frame1',
			type: 'frame',
			x: 5,
			y: 5,
			parentId: 'page:page',
			meta: {},
			props: { w: 300, h: 200 },
		} as any

		const focused = convertTldrawShapeToFocusedShape(editor, shape) as any
		expect(focused._type).toBe('unknown')
		expect(focused.w).toBe(300)
		expect(focused.h).toBe(200)
	})
})

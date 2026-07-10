import { describe, expect, test } from 'bun:test'
import { AgentHelpers, baseShapeId, resolveShapeIdByBase } from './AgentHelpers'

/** A minimal AgentHelpers instance for testing offset/rounding, which don't touch the editor. */
function makeHelpers(origin = { x: 0, y: 0 }) {
	const agent = { chatOrigin: { getOrigin: () => origin }, editor: {} } as any
	return new AgentHelpers(agent)
}

/** A minimal AgentHelpers instance backed by a fake editor with one shape, for ensureShapeIdExists. */
function makeHelpersWithShape(realShapeId: string) {
	const editor = {
		getShape: (id: string) => (id === `shape:${realShapeId}` ? { id } : undefined),
		getCurrentPageShapes: () => [{ id: `shape:${realShapeId}` }],
	}
	const agent = { chatOrigin: { getOrigin: () => ({ x: 0, y: 0 }) }, editor } as any
	return new AgentHelpers(agent)
}

describe('baseShapeId', () => {
	test('strips a single trailing -<digits> suffix', () => {
		expect(baseShapeId('tail-1')).toBe('tail')
		expect(baseShapeId('tail-12')).toBe('tail')
	})

	test('leaves an id with no numeric suffix unchanged', () => {
		expect(baseShapeId('tail')).toBe('tail')
	})

	test('only strips the last -<digits>, preserving hyphenated names', () => {
		expect(baseShapeId('dragon-tail-2')).toBe('dragon-tail')
		expect(baseShapeId('dragon-tail')).toBe('dragon-tail')
	})
})

describe('resolveShapeIdByBase', () => {
	test('resolves a uniquified id when exactly one shape shares the base', () => {
		expect(resolveShapeIdByBase('tail', ['tail-1', 'head', 'body'])).toBe('tail-1')
	})

	test('resolves an exact id (its own base matches itself)', () => {
		expect(resolveShapeIdByBase('head', ['tail-1', 'head', 'body'])).toBe('head')
	})

	test('returns null when no shape shares the base', () => {
		expect(resolveShapeIdByBase('wing', ['tail-1', 'head', 'body'])).toBeNull()
	})

	test('returns null when the base is ambiguous (two or more candidates)', () => {
		// Both tail-1 and tail-2 share base "tail"; requesting "tail" is ambiguous.
		expect(resolveShapeIdByBase('tail', ['tail-1', 'tail-2', 'head'])).toBeNull()
	})

	test('returns null on an empty shape list', () => {
		expect(resolveShapeIdByBase('tail', [])).toBeNull()
	})
})

describe('ensureShapeIdExists: shape: prefix defence', () => {
	test('resolves a real shape when the requested id is not prefixed', () => {
		const helpers = makeHelpersWithShape('rect1')
		expect(helpers.ensureShapeIdExists('rect1' as any)).toBe('rect1')
	})

	test('resolves a real shape even when the model incorrectly includes the "shape:" prefix', () => {
		const helpers = makeHelpersWithShape('rect1')
		expect(helpers.ensureShapeIdExists('shape:rect1' as any)).toBe('rect1')
	})
})

describe('AgentHelpers: offset round-trip', () => {
	test('applyOffsetToVec then removeOffsetFromVec restores the original vector', () => {
		const helpers = makeHelpers({ x: 12, y: -7 })
		const original = { x: 100, y: 200 }
		const offset = helpers.applyOffsetToVec(original)
		const restored = helpers.removeOffsetFromVec(offset)
		expect(restored).toEqual(original)
	})

	test('applyOffsetToBox then removeOffsetFromBox restores the original box', () => {
		const helpers = makeHelpers({ x: 12, y: -7 })
		const original = { x: 100, y: 200, w: 50, h: 60 }
		const offset = helpers.applyOffsetToBox(original)
		const restored = helpers.removeOffsetFromBox(offset)
		expect(restored).toEqual(original)
	})

	test('applyOffsetToVec does not mutate its input', () => {
		const helpers = makeHelpers({ x: 5, y: 5 })
		const original = { x: 1, y: 1 }
		helpers.applyOffsetToVec(original)
		expect(original).toEqual({ x: 1, y: 1 })
	})
})

describe('AgentHelpers: rounding round-trip', () => {
	test('roundAndSaveNumber then unroundAndRestoreNumber restores the original (possibly fractional) value', () => {
		const helpers = makeHelpers()
		const original = 12.6
		const rounded = helpers.roundAndSaveNumber(original, 'key1')
		expect(rounded).toBe(13)
		const restored = helpers.unroundAndRestoreNumber(rounded, 'key1')
		expect(restored).toBeCloseTo(original, 10)
	})

	test('unroundAndRestoreNumber is a no-op for an unknown key', () => {
		const helpers = makeHelpers()
		expect(helpers.unroundAndRestoreNumber(42, 'never-saved')).toBe(42)
	})

	test('roundProperty then unroundProperty restores the original fractional coordinate on a shape', () => {
		const helpers = makeHelpers()
		const shape = { shapeId: 'shape1', x: 12.6, y: 20 } as any
		helpers.roundProperty(shape, 'x')
		expect(shape.x).toBe(13)
		helpers.unroundProperty(shape, 'x')
		expect(shape.x).toBeCloseTo(12.6, 10)
	})

	test('roundBox does not mutate its input and returns a rounded copy', () => {
		const helpers = makeHelpers()
		const original = { x: 1.4, y: 2.6, w: 3.5, h: 4.4 }
		const rounded = helpers.roundBox(original)
		expect(original).toEqual({ x: 1.4, y: 2.6, w: 3.5, h: 4.4 })
		expect(rounded).toEqual({ x: 1, y: 3, w: 4, h: 4 })
	})

	test('roundVec does not mutate its input and returns a rounded copy', () => {
		const helpers = makeHelpers()
		const original = { x: 1.6, y: 2.4 }
		const rounded = helpers.roundVec(original)
		expect(original).toEqual({ x: 1.6, y: 2.4 })
		expect(rounded).toEqual({ x: 2, y: 2 })
	})
})

describe('AgentHelpers: ensureValueIsBoolean', () => {
	test('treats common falsy-looking strings as false', () => {
		const helpers = makeHelpers()
		expect(helpers.ensureValueIsBoolean('false')).toBe(false)
		expect(helpers.ensureValueIsBoolean('no')).toBe(false)
		expect(helpers.ensureValueIsBoolean('0')).toBe(false)
		expect(helpers.ensureValueIsBoolean('')).toBe(false)
	})

	test('treats other non-empty strings as true', () => {
		const helpers = makeHelpers()
		expect(helpers.ensureValueIsBoolean('true')).toBe(true)
		expect(helpers.ensureValueIsBoolean('yes')).toBe(true)
	})
})

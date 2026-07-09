import { describe, expect, test } from 'bun:test'
import { baseShapeId, resolveShapeIdByBase } from './AgentHelpers'

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

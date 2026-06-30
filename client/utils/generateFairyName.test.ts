import { afterEach, describe, expect, test } from 'bun:test'
import { generateFairyName } from './generateFairyName'

const originalRandom = Math.random

afterEach(() => {
	Math.random = originalRandom
})

describe('generateFairyName', () => {
	test('returns the first hardcoded fairy name when randomness selects the first entry', () => {
		Math.random = () => 0

		expect(generateFairyName()).toBe("Sniper's Dream")
	})

	test('returns the last hardcoded fairy name when randomness selects the final entry', () => {
		Math.random = () => 0.999999

		expect(generateFairyName()).toBe('Vicar of Dibley 2')
	})
})

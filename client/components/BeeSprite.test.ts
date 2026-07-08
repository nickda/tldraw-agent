import { describe, expect, test } from 'bun:test'
import { getBeeAnimationDelayMs } from './BeeSprite'

describe('getBeeAnimationDelayMs', () => {
	test('returns the fixed delay for each known bee', () => {
		expect(getBeeAnimationDelayMs('Beeyonce')).toBe(0)
		expect(getBeeAnimationDelayMs('MacBee')).toBe(-300)
		expect(getBeeAnimationDelayMs('WannaBee')).toBe(-600)
	})

	test('defaults to 0 for an unknown bee name', () => {
		expect(getBeeAnimationDelayMs('SomeFutureBee')).toBe(0)
	})
})

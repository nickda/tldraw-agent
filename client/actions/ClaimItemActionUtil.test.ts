import { describe, expect, test } from 'bun:test'
import {
	getSlackDurationMs,
	shouldSlack,
	WANNABEE_SLACK_CHANCE,
	WANNABEE_SLACK_MAX_MS,
	WANNABEE_SLACK_MIN_MS,
} from './ClaimItemActionUtil'

describe('shouldSlack', () => {
	test('never slacks for any bee other than WannaBee, regardless of roll', () => {
		expect(shouldSlack('MacBee', 0)).toBe(false)
		expect(shouldSlack('Beeyonce', 0)).toBe(false)
		expect(shouldSlack('Chairman Meow', 0)).toBe(false)
	})

	test('WannaBee slacks when the roll is below the configured chance', () => {
		expect(shouldSlack('WannaBee', 0)).toBe(true)
		expect(shouldSlack('WannaBee', WANNABEE_SLACK_CHANCE - 0.001)).toBe(true)
	})

	test('WannaBee does not slack when the roll is at or above the configured chance', () => {
		expect(shouldSlack('WannaBee', WANNABEE_SLACK_CHANCE)).toBe(false)
		expect(shouldSlack('WannaBee', 0.999)).toBe(false)
	})
})

describe('getSlackDurationMs', () => {
	test('maps roll=0 to the minimum duration', () => {
		expect(getSlackDurationMs(0)).toBe(WANNABEE_SLACK_MIN_MS)
	})

	test('maps roll close to 1 to just under the maximum duration', () => {
		const duration = getSlackDurationMs(0.999999)
		expect(duration).toBeGreaterThanOrEqual(WANNABEE_SLACK_MIN_MS)
		expect(duration).toBeLessThan(WANNABEE_SLACK_MAX_MS)
	})

	test('maps roll=0.5 to the midpoint duration', () => {
		expect(getSlackDurationMs(0.5)).toBe((WANNABEE_SLACK_MIN_MS + WANNABEE_SLACK_MAX_MS) / 2)
	})
})

import { describe, expect, test } from 'bun:test'
import { stripEmDashes } from './MessageActionUtil'

describe('stripEmDashes', () => {
	test('replaces an em dash with a comma', () => {
		expect(stripEmDashes('The house is up, the roof is on — job done.')).toBe(
			'The house is up, the roof is on, job done.'
		)
	})

	test('replaces an en dash with a comma', () => {
		expect(stripEmDashes('Any day now – any day.')).toBe('Any day now, any day.')
	})

	test('replaces double hyphens with a comma', () => {
		expect(stripEmDashes('Fine -- I will do the flowers.')).toBe('Fine, I will do the flowers.')
	})

	test('collapses surrounding whitespace around the dash', () => {
		expect(stripEmDashes('left—right')).toBe('left, right')
		expect(stripEmDashes('left — right')).toBe('left, right')
	})

	test('leaves dash-free text untouched', () => {
		expect(stripEmDashes('Och, a fine wee tree, nae bother.')).toBe(
			'Och, a fine wee tree, nae bother.'
		)
	})

	test('handles multiple dashes in one string', () => {
		expect(stripEmDashes('one — two — three')).toBe('one, two, three')
	})
})

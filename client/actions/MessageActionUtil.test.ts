import { describe, expect, test } from 'bun:test'
import { britishiseSpelling, stripEmDashes } from './MessageActionUtil'

describe('britishiseSpelling', () => {
	test('converts common American spellings to British', () => {
		expect(britishiseSpelling('a salmon-colored cafeteria')).toBe('a salmon-coloured cafeteria')
		expect(britishiseSpelling('the color pass ran')).toBe('the colour pass ran')
		expect(britishiseSpelling('fixes the figure colors')).toBe('fixes the figure colours')
		expect(britishiseSpelling('centered in the canvas')).toBe('centred in the canvas')
		expect(britishiseSpelling('a gray box')).toBe('a grey box')
	})

	test('preserves casing', () => {
		expect(britishiseSpelling('Colored')).toBe('Coloured')
		expect(britishiseSpelling('COLOR')).toBe('COLOUR')
		expect(britishiseSpelling('Center')).toBe('Centre')
	})

	test('leaves words not in the map untouched, including risky look-alikes', () => {
		expect(britishiseSpelling('size prize her doctor horror')).toBe('size prize her doctor horror')
	})

	test('leaves text with no American spellings unchanged', () => {
		expect(britishiseSpelling('Och, a fine wee beastie, nae bother.')).toBe(
			'Och, a fine wee beastie, nae bother.'
		)
	})
})

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

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FairySprite } from './FairySprite'

describe('FairySprite', () => {
	test('keeps the fairy name out of visible markup while preserving the pointer-event contract', () => {
		const markup = renderToStaticMarkup(
			<FairySprite fairyName="Bonnie Kettlewick" state="idle" />
		)

		expect(markup).toContain('data-fairy-state="idle"')
		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('<svg')
		expect(markup).toContain('aria-label="Bonnie Kettlewick fairy"')
		expect(markup).not.toContain('fairy-sprite__name')
	})

	test('adds state-specific classes and a back-facing drawing pose', () => {
		const drawingMarkup = renderToStaticMarkup(
			<FairySprite fairyName="Grog Fernsby" state="drawing" />
		)
		const annoyedMarkup = renderToStaticMarkup(
			<FairySprite fairyName="Grog Fernsby" state="annoyed" />
		)

		expect(drawingMarkup).toContain('fairy-sprite--drawing')
		expect(drawingMarkup).toContain('fairy-sprite__pose--drawing')
		expect(drawingMarkup).not.toContain('fairy-sprite__pose--front')
		expect(annoyedMarkup).toContain('fairy-sprite--annoyed')
	})
})

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { FairySprite } from './FairySprite'

describe('FairySprite', () => {
	test('renders the fairy name below the sprite with the expected pointer-event contract', () => {
		const markup = renderToStaticMarkup(
			<FairySprite fairyName="Bonnie Kettlewick" state="idle" />
		)

		expect(markup).toContain('Bonnie Kettlewick')
		expect(markup).toContain('data-fairy-state="idle"')
		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('<svg')
	})

	test('adds state-specific classes for drawing and annoyed fairy behavior', () => {
		const drawingMarkup = renderToStaticMarkup(
			<FairySprite fairyName="Grog Fernsby" state="drawing" />
		)
		const annoyedMarkup = renderToStaticMarkup(
			<FairySprite fairyName="Grog Fernsby" state="annoyed" />
		)

		expect(drawingMarkup).toContain('fairy-sprite--drawing')
		expect(annoyedMarkup).toContain('fairy-sprite--annoyed')
	})
})

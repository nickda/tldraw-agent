import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BeeSprite } from './BeeSprite'

describe('BeeSprite', () => {
	test('keeps the bee name out of visible markup while preserving the pointer-event contract', () => {
		const markup = renderToStaticMarkup(
			<BeeSprite beeName="Bonnie Kettlewick" state="idle" />
		)

		expect(markup).toContain('data-bee-state="idle"')
		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('<svg')
		expect(markup).toContain('aria-label="Bonnie Kettlewick bee"')
		expect(markup).not.toContain('bee-sprite__name')
	})

	test('adds state-specific classes and a distinct drawing pose', () => {
		const drawingMarkup = renderToStaticMarkup(
			<BeeSprite beeName="Grog Fernsby" state="drawing" />
		)
		const annoyedMarkup = renderToStaticMarkup(
			<BeeSprite beeName="Grog Fernsby" state="annoyed" />
		)

		expect(drawingMarkup).toContain('bee-sprite--drawing')
		expect(drawingMarkup).toContain('bee-sprite__pose--drawing')
		expect(drawingMarkup).not.toContain('bee-sprite__pose--front')
		expect(annoyedMarkup).toContain('bee-sprite--annoyed')
		expect(annoyedMarkup).toContain('bee-sprite__pose--front')
	})

	test('renders the saltire body variant only for MacBee', () => {
		const macBeeMarkup = renderToStaticMarkup(<BeeSprite beeName="MacBee" state="idle" />)
		const otherMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="idle" />)

		expect(macBeeMarkup).toContain('bee-sprite__body--saltire')
		expect(macBeeMarkup).not.toContain('bee-sprite__body--classic')
		expect(otherMarkup).toContain('bee-sprite__body--classic')
		expect(otherMarkup).not.toContain('bee-sprite__body--saltire')
	})

	test('renders queen regalia only for Beeyonce', () => {
		const queenMarkup = renderToStaticMarkup(<BeeSprite beeName="Beeyonce" state="idle" />)
		const otherMarkup = renderToStaticMarkup(<BeeSprite beeName="MacBee" state="idle" />)

		expect(queenMarkup).toContain('bee-sprite__queen-regalia')
		expect(queenMarkup).toContain('bee-sprite__crown')
		expect(queenMarkup).toContain('bee-sprite__sash')
		expect(otherMarkup).not.toContain('bee-sprite__queen-regalia')
	})

	test('renders the slacking accessory only in the slacking state', () => {
		const slackingMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="slacking" />)
		const idleMarkup = renderToStaticMarkup(<BeeSprite beeName="WannaBee" state="idle" />)

		expect(slackingMarkup).toContain('bee-sprite__pose--slacking')
		expect(slackingMarkup).toContain('bee-sprite__slacking-accessory')
		expect(slackingMarkup).toContain('bee-sprite__duck-lips')
		expect(idleMarkup).not.toContain('bee-sprite__slacking-accessory')
	})
})

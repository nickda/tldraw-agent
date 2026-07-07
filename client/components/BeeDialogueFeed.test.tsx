import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BeeDialogueLine } from '../hooks/useBeeDialogue'
import { renderBeeDialogueLine } from './BeeDialogueFeed'

function line(overrides: Partial<BeeDialogueLine> = {}): BeeDialogueLine {
	return {
		key: 'a1:0',
		agentId: 'a1',
		beeName: 'Beeyonce',
		beeColor: '#6366f1',
		text: 'Drawing a house.',
		timestamp: 1000,
		...overrides,
	}
}

describe('renderBeeDialogueLine', () => {
	test('renders the bee name and message text', () => {
		const markup = renderToStaticMarkup(<>{renderBeeDialogueLine(line())}</>)
		expect(markup).toContain('Beeyonce')
		expect(markup).toContain('Drawing a house.')
	})

	test('applies the beeColor to the attribution dot', () => {
		const markup = renderToStaticMarkup(
			<>{renderBeeDialogueLine(line({ beeColor: '#f59e0b', beeName: 'MacBee' }))}</>
		)
		expect(markup).toContain('#f59e0b')
		expect(markup).toContain('MacBee')
	})

	test('uses the line key as a stable identity', () => {
		const el = renderBeeDialogueLine(line({ key: 'exec0:3' }))
		expect(el.key).toBe('exec0:3')
	})
})

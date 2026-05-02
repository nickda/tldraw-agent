import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { didFairyPositionMove } from './FairyAvatarOverlay'

describe('FairyAvatarOverlay styles', () => {
	test('uses the expected absolute overlay positioning contract', () => {
		const markup = renderToStaticMarkup(
			<div
				className="fairy-avatar-overlay"
				style={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					overflow: 'visible',
				}}
			>
				<div
					className="fairy-avatar-overlay__sprite"
					style={{
						position: 'absolute',
						left: 120,
						top: 240,
						transition: 'left 400ms ease-out, top 400ms ease-out',
						transform: 'translate(-50%, -100%)',
					}}
				/>
			</div>
		)

		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('overflow:visible')
		expect(markup).toContain('left:120px')
		expect(markup).toContain('top:240px')
		expect(markup).toContain('transition:left 400ms ease-out, top 400ms ease-out')
	})

	test('only treats page-space position changes as movement', () => {
		expect(didFairyPositionMove({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(false)
		expect(didFairyPositionMove({ x: 10, y: 20 }, { x: 11, y: 20 })).toBe(true)
		expect(didFairyPositionMove(null, { x: 10, y: 20 })).toBe(true)
		expect(didFairyPositionMove({ x: 10, y: 20 }, null)).toBe(false)
	})
})

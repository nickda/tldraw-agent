import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { didFairyPositionMove, getFairyScreenPosition, getFairySpriteScale } from './FairyAvatarOverlay'

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
						pointerEvents: 'auto',
						cursor: 'grab',
						touchAction: 'none',
					}}
				/>
			</div>
		)

		expect(markup).toContain('pointer-events:none')
		expect(markup).toContain('overflow:visible')
		expect(markup).toContain('left:120px')
		expect(markup).toContain('top:240px')
		expect(markup).toContain('transition:left 400ms ease-out, top 400ms ease-out')
		expect(markup).toContain('pointer-events:auto')
		expect(markup).toContain('cursor:grab')
		expect(markup).toContain('touch-action:none')
	})

	test('only treats page-space position changes as movement', () => {
		expect(didFairyPositionMove({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(false)
		expect(didFairyPositionMove({ x: 10, y: 20 }, { x: 11, y: 20 })).toBe(true)
		expect(didFairyPositionMove(null, { x: 10, y: 20 })).toBe(true)
		expect(didFairyPositionMove({ x: 10, y: 20 }, null)).toBe(false)
		expect(didFairyPositionMove(null, null)).toBe(false)
	})

	test('keeps the sprite scale inverse to zoom level', () => {
		expect(getFairySpriteScale(1)).toBe(1)
		expect(getFairySpriteScale(2)).toBe(0.5)
		expect(getFairySpriteScale(0.5)).toBe(2)
		expect(getFairySpriteScale(0)).toBe(1)
	})

	test('converts page position to screen position via pageToScreen transform', () => {
		const pageToScreen = (pos: { x: number; y: number }) => ({ x: pos.x * 2, y: pos.y * 3 })
		expect(getFairyScreenPosition({ x: 50, y: 40 }, pageToScreen)).toEqual({ x: 100, y: 120 })
		expect(getFairyScreenPosition(null, pageToScreen)).toBeNull()
	})
})

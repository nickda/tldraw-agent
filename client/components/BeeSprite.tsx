import type { CSSProperties } from 'react'
import { BeeState } from '../types/BeeState'

/**
 * Deterministic per-bee offset so idle/planning bob and wing-flutter don't
 * run in lockstep across all three bees. Negative delays start each bee
 * partway through its cycle immediately on mount, avoiding a visible
 * catch-up pause. Any bee name not listed here defaults to 0ms.
 */
const BEE_ANIMATION_DELAY_MS: Record<string, number> = {
	Beeyonce: 0,
	MacBee: -300,
	WannaBee: -600,
}

export function getBeeAnimationDelayMs(beeName: string): number {
	return BEE_ANIMATION_DELAY_MS[beeName] ?? 0
}

export function BeeSprite({
	beeName,
	state,
	color = 'currentColor',
}: {
	beeName: string
	state: BeeState
	color?: string
}) {
	const rootClassName = `bee-sprite bee-sprite--${state}`
	const svgClassName = `bee-sprite__svg bee-sprite__svg--${state}`
	const poseName = getPoseName(state)
	const variant: 'classic' | 'saltire' = beeName === 'MacBee' ? 'saltire' : 'classic'
	const isQueen = beeName === 'Beeyonce'

	return (
		<div
			className={rootClassName}
			data-bee-state={state}
			style={
				{
					pointerEvents: 'none',
					'--bee-anim-delay': `${getBeeAnimationDelayMs(beeName)}ms`,
				} as CSSProperties
			}
		>
			<div className="bee-sprite__figure" style={{ pointerEvents: 'auto' }}>
				<svg
					aria-label={`${beeName} bee`}
					className={svgClassName}
					viewBox="0 0 48 56"
					width="48"
					height="48"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<g className={`bee-sprite__pose bee-sprite__pose--${poseName}`}>
						<BeeWings color={color} />
						<BeeAntennae />
						<BeeBody variant={variant} />
						{poseName === 'planning' && <PlanningClipboard />}
						{poseName === 'slacking' && <SlackingAccessory />}
					</g>
					{isQueen && <QueenRegalia />}
				</svg>
			</div>
		</div>
	)
}

function getPoseName(state: BeeState): 'front' | 'drawing' | 'planning' | 'slacking' {
	if (state === 'planning') return 'planning'
	if (state === 'drawing') return 'drawing'
	if (state === 'slacking') return 'slacking'
	return 'front'
}

function BeeWings({ color }: { color: string }) {
	return (
		<g className="bee-sprite__wings">
			<ellipse
				className="bee-sprite__wing bee-sprite__wing--left"
				cx="15"
				cy="20"
				rx="9"
				ry="5"
				fill="rgba(255,255,255,0.6)"
				stroke={color}
				transform="rotate(-15 15 20)"
			/>
			<ellipse
				className="bee-sprite__wing bee-sprite__wing--right"
				cx="33"
				cy="20"
				rx="9"
				ry="5"
				fill="rgba(255,255,255,0.6)"
				stroke={color}
				transform="rotate(15 33 20)"
			/>
		</g>
	)
}

function BeeAntennae() {
	return (
		<g className="bee-sprite__antennae">
			<path d="M18 12C16 8 14 6 12 5" stroke="currentColor" strokeLinecap="round" />
			<path d="M30 12C32 8 34 6 36 5" stroke="currentColor" strokeLinecap="round" />
			<circle cx="12" cy="4.5" r="1.5" fill="currentColor" />
			<circle cx="36" cy="4.5" r="1.5" fill="currentColor" />
		</g>
	)
}

function BeeBody({ variant }: { variant: 'classic' | 'saltire' }) {
	if (variant === 'saltire') {
		return (
			<g className="bee-sprite__body bee-sprite__body--saltire">
				<circle cx="24" cy="14" r="6" fill="#0033A0" />
				<circle cx="21" cy="13" r="1" fill="#fff" />
				<circle cx="27" cy="13" r="1" fill="#fff" />
				<path
					d="M15 22C15 20 33 20 33 22V38C33 46 15 46 15 38Z"
					fill="#fff"
					stroke="#0033A0"
				/>
				<path d="M15 27H33" stroke="#0033A0" strokeWidth="3" />
				<path d="M15 33H33" stroke="#0033A0" strokeWidth="3" />
				<path d="M16 39C18 41 30 41 32 39" stroke="#0033A0" strokeWidth="3" fill="none" />
			</g>
		)
	}

	return (
		<g className="bee-sprite__body bee-sprite__body--classic">
			<ellipse cx="24" cy="30" rx="13" ry="16" fill="#FFC94A" />
			<path d="M12 22C16 24 32 24 36 22" stroke="currentColor" strokeWidth="3" fill="none" />
			<path d="M12 30C16 32 32 32 36 30" stroke="currentColor" strokeWidth="3" fill="none" />
			<path d="M13 38C17 40 31 40 35 38" stroke="currentColor" strokeWidth="3" fill="none" />
			<circle cx="19" cy="26" r="1.3" fill="currentColor" />
			<circle cx="29" cy="26" r="1.3" fill="currentColor" />
		</g>
	)
}

function QueenRegalia() {
	return (
		<g className="bee-sprite__queen-regalia">
			<polygon
				className="bee-sprite__crown"
				points="14,8 24,2 34,8 31,14 17,14"
				fill="#E0E0E0"
				stroke="#9E9E9E"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</g>
	)
}

function PlanningClipboard() {
	return (
		<g className="bee-sprite__clipboard">
			<rect x="2" y="30" width="8" height="11" rx="1" fill="white" stroke="currentColor" strokeWidth="0.8" />
			<path d="M4 33H8" stroke="currentColor" strokeWidth="0.5" />
			<path d="M4 35.5H8" stroke="currentColor" strokeWidth="0.5" />
			<path d="M4 38H7" stroke="currentColor" strokeWidth="0.5" />
		</g>
	)
}

function SlackingAccessory() {
	return (
		<g className="bee-sprite__slacking-accessory">
			{/* left arm holding phone */}
			<path d="M12 24L18 22" stroke="currentColor" strokeLinecap="round" />
			<rect
				x="17"
				y="14"
				width="7"
				height="11"
				rx="1.3"
				fill="#333"
				transform="rotate(20 20.5 19.5)"
			/>
			{/* right arm flung out dramatically */}
			<path d="M36 24L44 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			{/* duck lips */}
			<ellipse
				className="bee-sprite__duck-lips"
				cx="24"
				cy="31"
				rx="3"
				ry="1.6"
				fill="#D6336C"
				stroke="#a61e4d"
				strokeWidth="0.6"
			/>
		</g>
	)
}

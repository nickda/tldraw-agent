import { FairyState } from '../types/FairyState'

export function FairySprite({
	fairyName,
	state,
}: {
	fairyName: string
	state: FairyState
}) {
	const rootClassName = `fairy-sprite fairy-sprite--${state}`
	const svgClassName = `fairy-sprite__svg fairy-sprite__svg--${state}`

	return (
		<div
			className={rootClassName}
			data-fairy-state={state}
			style={{ pointerEvents: 'none' }}
		>
			<div className="fairy-sprite__figure" style={{ pointerEvents: 'auto' }}>
				<svg
					aria-label={`${fairyName} fairy`}
					className={svgClassName}
					viewBox="0 0 48 56"
					width="40"
					height="40"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<g className="fairy-sprite__wings">
						<ellipse className="fairy-sprite__wing fairy-sprite__wing--upper-left" cx="15" cy="16" rx="8" ry="4" stroke="currentColor" />
						<ellipse className="fairy-sprite__wing fairy-sprite__wing--upper-right" cx="33" cy="16" rx="8" ry="4" stroke="currentColor" />
						<ellipse className="fairy-sprite__wing fairy-sprite__wing--lower-left" cx="12" cy="24" rx="7" ry="3.5" stroke="currentColor" />
						<ellipse className="fairy-sprite__wing fairy-sprite__wing--lower-right" cx="36" cy="24" rx="7" ry="3.5" stroke="currentColor" />
					</g>
					{state === 'drawing' ? <DrawingFairyPose /> : <FrontFairyPose />}
				</svg>
			</div>
		</div>
	)
}

function FrontFairyPose() {
	return (
		<g className="fairy-sprite__pose fairy-sprite__pose--front">
			<circle cx="24" cy="12" r="7" fill="white" stroke="currentColor" />
			<path d="M18 22L14 28" stroke="currentColor" strokeLinecap="round" />
			<path d="M30 22L34 28" stroke="currentColor" strokeLinecap="round" />
			<path d="M14 23L24 29L34 23" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 19V39" stroke="currentColor" strokeLinecap="round" />
			<path d="M17 28L24 32L31 28" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 39L18 48" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 39L30 48" stroke="currentColor" strokeLinecap="round" />
			<circle cx="21" cy="11" r="1" fill="currentColor" />
			<circle cx="27" cy="11" r="1" fill="currentColor" />
			<path d="M21 15C22.5 16.5 25.5 16.5 27 15" stroke="currentColor" strokeLinecap="round" />
		</g>
	)
}

function DrawingFairyPose() {
	return (
		<g className="fairy-sprite__pose fairy-sprite__pose--drawing" aria-hidden="true">
			<circle cx="24" cy="12" r="7" fill="white" stroke="currentColor" />
			<path d="M20 9C22 7.5 26 7.5 28 9" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 19V36" stroke="currentColor" strokeLinecap="round" />
			<path d="M18 22L14 34L20 43" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M30 22L34 34L28 43" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="20" cy="43" r="1.8" fill="white" stroke="currentColor" />
			<circle cx="28" cy="43" r="1.8" fill="white" stroke="currentColor" />
			<path d="M20 43C22 46 26 46 28 43" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 36L18 48" stroke="currentColor" strokeLinecap="round" />
			<path d="M24 36L30 48" stroke="currentColor" strokeLinecap="round" />
			<path d="M18 27L24 31L30 27" stroke="currentColor" strokeLinecap="round" />
		</g>
	)
}

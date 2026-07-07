const RETICLE_SIZE = 48
const CORNER_LEN = 10
const GAP = 4

export function BeeReticle({ color, active }: { color: string; active: boolean }) {
	return (
		<div
			className="bee-reticle"
			style={{
				position: 'absolute',
				left: '50%',
				top: '50%',
				width: RETICLE_SIZE,
				height: RETICLE_SIZE,
				transform: 'translate(-50%, -50%)',
				pointerEvents: 'none',
				opacity: active ? 1 : 0,
				transition: 'opacity 200ms ease-out',
			}}
		>
			<svg
				width={RETICLE_SIZE}
				height={RETICLE_SIZE}
				viewBox={`0 0 ${RETICLE_SIZE} ${RETICLE_SIZE}`}
				fill="none"
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
			>
				{/* Top-left corner */}
				<path d={`M${GAP},${CORNER_LEN} L${GAP},${GAP} L${CORNER_LEN},${GAP}`} />
				{/* Top-right corner */}
				<path d={`M${RETICLE_SIZE - CORNER_LEN},${GAP} L${RETICLE_SIZE - GAP},${GAP} L${RETICLE_SIZE - GAP},${CORNER_LEN}`} />
				{/* Bottom-left corner */}
				<path d={`M${GAP},${RETICLE_SIZE - CORNER_LEN} L${GAP},${RETICLE_SIZE - GAP} L${CORNER_LEN},${RETICLE_SIZE - GAP}`} />
				{/* Bottom-right corner */}
				<path d={`M${RETICLE_SIZE - CORNER_LEN},${RETICLE_SIZE - GAP} L${RETICLE_SIZE - GAP},${RETICLE_SIZE - GAP} L${RETICLE_SIZE - GAP},${RETICLE_SIZE - CORNER_LEN}`} />
			</svg>
		</div>
	)
}

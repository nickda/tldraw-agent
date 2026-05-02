import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, useValue, VecModel } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'
import { useAgents } from '../agent/TldrawAgentAppProvider'
import { useFairyPosition } from '../hooks/useFairyPosition'
import { FairyState } from '../types/FairyState'
import { generateFairyName } from '../utils/generateFairyName'
import { FairySprite } from './FairySprite'

const FAIRY_MOVE_DURATION_MS = 400
const FAIRY_ANNOYED_DELAY_MS = 2000

function getFairySpriteScale(zoomLevel: number) {
	return zoomLevel > 0 ? 1 / zoomLevel : 1
}

export function FairyAvatarOverlays() {
	const agents = useAgents()

	return (
		<>
			{agents.map((agent) => (
				<FairyAvatarOverlay key={agent.id} agent={agent} />
			))}
		</>
	)
}

export function FairyAvatarOverlay({ agent }: { agent: TldrawAgent }) {
	const editor = useEditor()
	const fairyName = useMemo(() => generateFairyName(), [])
	const fairyPosition = useFairyPosition(agent)
	const [motionState, setMotionState] = useState<FairyState>('idle')
	const [isAnnoyed, setIsAnnoyed] = useState(false)
	const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const annoyedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isPressActiveRef = useRef(false)
	const previousFairyPositionRef = useRef<VecModel | null>(null)
	const zoomLevel = useValue(
		'fairyZoomLevel',
		() => {
			editor.getCamera()
			return editor.getZoomLevel()
		},
		[editor]
	)

	const screenPosition = useValue(
		'fairyScreenPosition',
		() => {
			if (!fairyPosition) return null

			// Recompute when the camera changes so the Fairy tracks pan/zoom.
			editor.getCamera()
			editor.getZoomLevel()

			return editor.pageToScreen(fairyPosition)
		},
		[editor, fairyPosition]
	)

	useEffect(() => {
		if (!fairyPosition) return

		const hasMoved = didFairyPositionMove(previousFairyPositionRef.current, fairyPosition)
		previousFairyPositionRef.current = fairyPosition

		if (!hasMoved) return

		setMotionState('drawing')
		if (movementTimeoutRef.current) {
			clearTimeout(movementTimeoutRef.current)
		}
		movementTimeoutRef.current = setTimeout(() => {
			setMotionState('idle')
			movementTimeoutRef.current = null
		}, FAIRY_MOVE_DURATION_MS)
	}, [fairyPosition])

	useEffect(() => {
		const clearAnnoyedTimer = () => {
			if (annoyedTimeoutRef.current) {
				clearTimeout(annoyedTimeoutRef.current)
				annoyedTimeoutRef.current = null
			}
		}

		const clearAnnoyedPress = () => {
			isPressActiveRef.current = false
			clearAnnoyedTimer()
			setIsAnnoyed(false)
		}

		window.addEventListener('mouseup', clearAnnoyedPress)
		window.addEventListener('pointerup', clearAnnoyedPress)
		window.addEventListener('pointercancel', clearAnnoyedPress)
		window.addEventListener('blur', clearAnnoyedPress)

		return () => {
			window.removeEventListener('mouseup', clearAnnoyedPress)
			window.removeEventListener('pointerup', clearAnnoyedPress)
			window.removeEventListener('pointercancel', clearAnnoyedPress)
			window.removeEventListener('blur', clearAnnoyedPress)

			if (movementTimeoutRef.current) {
				clearTimeout(movementTimeoutRef.current)
			}
			if (annoyedTimeoutRef.current) {
				clearTimeout(annoyedTimeoutRef.current)
			}
		}
	}, [])

	if (!screenPosition) return null

	const state: FairyState = isAnnoyed ? 'annoyed' : motionState

	return (
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
					left: screenPosition.x,
					top: screenPosition.y,
					transition: `left ${FAIRY_MOVE_DURATION_MS}ms ease-out, top ${FAIRY_MOVE_DURATION_MS}ms ease-out`,
					transform: 'translate(-50%, -100%)',
				}}
				onMouseDown={() => {
					if (isPressActiveRef.current) return

					isPressActiveRef.current = true
					if (annoyedTimeoutRef.current) {
						clearTimeout(annoyedTimeoutRef.current)
					}
					annoyedTimeoutRef.current = setTimeout(() => {
						if (isPressActiveRef.current) {
							setIsAnnoyed(true)
						}
						annoyedTimeoutRef.current = null
					}, FAIRY_ANNOYED_DELAY_MS)
				}}
				onPointerDown={() => {
					if (isPressActiveRef.current) return

					isPressActiveRef.current = true
					if (annoyedTimeoutRef.current) {
						clearTimeout(annoyedTimeoutRef.current)
					}
					annoyedTimeoutRef.current = setTimeout(() => {
						if (isPressActiveRef.current) {
							setIsAnnoyed(true)
						}
						annoyedTimeoutRef.current = null
					}, FAIRY_ANNOYED_DELAY_MS)
				}}
			>
				<div
					style={{
						transform: `scale(${getFairySpriteScale(zoomLevel)})`,
						transformOrigin: 'center bottom',
					}}
				>
					<FairySprite fairyName={fairyName} state={state} />
				</div>
			</div>
		</div>
	)
}

export function didFairyPositionMove(
	previousPosition: VecModel | null,
	currentPosition: VecModel | null
) {
	if (!previousPosition) return !!currentPosition
	if (!currentPosition) return false
	return (
		previousPosition.x !== currentPosition.x ||
		previousPosition.y !== currentPosition.y
	)
}

export { getFairySpriteScale }

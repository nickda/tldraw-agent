import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useEditor, useValue, VecModel } from 'tldraw'
import { TldrawAgent } from '../agent/TldrawAgent'
import { useAgents } from '../agent/TldrawAgentAppProvider'
import { useBeePosition } from '../hooks/useBeePosition'
import { useLatestBeeMessage } from '../hooks/useBeeSpeech'
import { BeeState } from '../types/BeeState'
import { BeeSprite } from './BeeSprite'
import { BeeReticle } from './BeeReticle'

const BEE_MOVE_DURATION_MS = 2000
const BEE_ANNOYED_DELAY_MS = 2000
const BEE_SPEECH_DURATION_MS = 12000

export function getBeeSpriteScale(zoomLevel: number) {
	return zoomLevel > 0 ? 1 / zoomLevel : 1
}

export function getBeeScreenPosition(
	pagePosition: VecModel | null,
	pageToScreen: (pos: VecModel) => VecModel
): VecModel | null {
	if (!pagePosition) return null
	return pageToScreen(pagePosition)
}

export function BeeAvatarOverlays() {
	const agents = useAgents()

	return (
		<>
			{agents.map((agent) => (
				<BeeAvatarOverlay key={agent.id} agent={agent} />
			))}
		</>
	)
}

export function BeeAvatarOverlay({ agent }: { agent: TldrawAgent }) {
	const editor = useEditor()
	const beeName = agent.beeName
	const beePosition = useBeePosition(agent)
	const isActive = useValue(
		`bee-active-${agent.id}`,
		() => agent.requests.isGenerating(),
		[agent]
	)
	const isSlacking = useValue(
		`bee-slacking-${agent.id}`,
		() => agent.requests.isSlacking(),
		[agent]
	)
	const latestMessage = useLatestBeeMessage(agent)
	const [visibleSpeech, setVisibleSpeech] = useState<string | null>(null)
	const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [motionState, setMotionState] = useState<BeeState>('idle')
	const [isAnnoyed, setIsAnnoyed] = useState(false)
	const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const annoyedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isPressActiveRef = useRef(false)
	const activePointerIdRef = useRef<number | null>(null)
	const dragOffsetRef = useRef<VecModel | null>(null)
	const previousBeePositionRef = useRef<VecModel | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const zoomLevel = useValue(
		'beeZoomLevel',
		() => {
			editor.getCamera()
			return editor.getZoomLevel()
		},
		[editor]
	)

	const pagePosition = beePosition


	const clearAnnoyedTimer = () => {
		if (annoyedTimeoutRef.current) {
			clearTimeout(annoyedTimeoutRef.current)
			annoyedTimeoutRef.current = null
		}
	}

	const clearPointerInteraction = () => {
		activePointerIdRef.current = null
		dragOffsetRef.current = null
		isPressActiveRef.current = false
		clearAnnoyedTimer()
		setIsAnnoyed(false)
		setIsDragging(false)
	}

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!pagePosition) return

		event.preventDefault()
		event.stopPropagation()
		event.currentTarget.setPointerCapture(event.pointerId)

		const pointerPagePosition = editor.screenToPage({ x: event.clientX, y: event.clientY })
		activePointerIdRef.current = event.pointerId
		dragOffsetRef.current = {
			x: pagePosition.x - pointerPagePosition.x,
			y: pagePosition.y - pointerPagePosition.y,
		}
		isPressActiveRef.current = true
		setIsDragging(true)

		clearAnnoyedTimer()
		annoyedTimeoutRef.current = setTimeout(() => {
			if (isPressActiveRef.current) {
				setIsAnnoyed(true)
			}
			annoyedTimeoutRef.current = null
		}, BEE_ANNOYED_DELAY_MS)
	}

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (activePointerIdRef.current !== event.pointerId || !dragOffsetRef.current) return

		event.preventDefault()
		event.stopPropagation()

		isPressActiveRef.current = false
		clearAnnoyedTimer()

		const pointerPagePosition = editor.screenToPage({ x: event.clientX, y: event.clientY })
		agent.requests.setBeePosition({
			x: pointerPagePosition.x + dragOffsetRef.current.x,
			y: pointerPagePosition.y + dragOffsetRef.current.y,
		})
	}

	const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (activePointerIdRef.current !== event.pointerId) return

		event.preventDefault()
		event.stopPropagation()
		clearPointerInteraction()
	}

	useEffect(() => {
		if (!pagePosition) return
		if (activePointerIdRef.current !== null) return

		const hasMoved = didBeePositionMove(previousBeePositionRef.current, pagePosition)
		previousBeePositionRef.current = pagePosition

		if (!hasMoved) return

		setMotionState('drawing')
		if (movementTimeoutRef.current) {
			clearTimeout(movementTimeoutRef.current)
		}
		movementTimeoutRef.current = setTimeout(() => {
			setMotionState('idle')
			movementTimeoutRef.current = null
		}, BEE_MOVE_DURATION_MS)
	}, [pagePosition])

	// Show the latest message as a transient speech bubble, then auto-hide it.
	// Keyed on the message's history index so re-showing the same text works and
	// stale timers from a prior message are cleared.
	useEffect(() => {
		if (speechTimeoutRef.current) {
			clearTimeout(speechTimeoutRef.current)
			speechTimeoutRef.current = null
		}
		if (!latestMessage) {
			// Chat history was reset (Clear/New chat): drop any bubble still
			// showing instead of leaving stale text up until its timer fires.
			setVisibleSpeech(null)
			return
		}
		setVisibleSpeech(latestMessage.text)
		speechTimeoutRef.current = setTimeout(() => {
			setVisibleSpeech(null)
			speechTimeoutRef.current = null
		}, BEE_SPEECH_DURATION_MS)
	}, [latestMessage?.index])

	useEffect(() => {
		return () => {
			if (speechTimeoutRef.current) {
				clearTimeout(speechTimeoutRef.current)
			}
		}
	}, [])

	useEffect(() => {
		window.addEventListener('mouseup', clearPointerInteraction)
		window.addEventListener('pointerup', clearPointerInteraction)
		window.addEventListener('pointercancel', clearPointerInteraction)
		window.addEventListener('blur', clearPointerInteraction)

		return () => {
			window.removeEventListener('mouseup', clearPointerInteraction)
			window.removeEventListener('pointerup', clearPointerInteraction)
			window.removeEventListener('pointercancel', clearPointerInteraction)
			window.removeEventListener('blur', clearPointerInteraction)

			if (movementTimeoutRef.current) {
				clearTimeout(movementTimeoutRef.current)
			}
			if (annoyedTimeoutRef.current) {
				clearTimeout(annoyedTimeoutRef.current)
			}
		}
	}, [])

	if (!pagePosition) return null

	// The two executors draw in adjacent regions and end up ~60px apart, so
	// their centered speech bubbles overlap. Fan them outward by name: MacBee
	// (always the left executor) grows its bubble left, WannaBee (always right)
	// grows right, so the bubbles can never cover each other.
	// The planner (Beeyonce) has no fixed side, she moves around the canvas
	// and can end up next to either executor, so instead her bubble stacks
	// higher, clearing the executors' bubble row entirely regardless of which
	// one she's near. Solo mode (no role-based bees) keeps the default
	// centered bubble.
	const speechSideClass =
		agent.role === 'planner'
			? ' bee-speech-bubble--planner'
			: beeName === 'MacBee'
				? ' bee-speech-bubble--left'
				: beeName === 'WannaBee'
					? ' bee-speech-bubble--right'
					: ''

	const plannerPlanning = agent.role === 'planner' && isActive && motionState === 'idle'
	const state: BeeState = isSlacking
		? 'slacking'
		: isAnnoyed
			? 'annoyed'
			: plannerPlanning
				? 'planning'
				: motionState

	return (
		<div
			className="bee-avatar-overlay"
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				overflow: 'visible',
			}}
		>
			<div
				className="bee-avatar-overlay__sprite"
				style={{
					position: 'absolute',
					left: pagePosition.x,
					top: pagePosition.y,
					transition: isDragging
						? 'none'
						: `left ${BEE_MOVE_DURATION_MS}ms ease-out, top ${BEE_MOVE_DURATION_MS}ms ease-out`,
					transform: 'translate(-50%, -100%)',
					pointerEvents: 'auto',
					cursor: isDragging ? 'grabbing' : 'grab',
					touchAction: 'none',
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				<div
					style={{
						transform: `scale(${getBeeSpriteScale(zoomLevel)})`,
						transformOrigin: 'center bottom',
						position: 'relative',
					}}
				>
					{visibleSpeech && (
						<div
							className={`bee-speech-bubble${speechSideClass}`}
							style={{ borderColor: agent.beeColor, color: agent.beeColor }}
						>
							<span className="bee-speech-bubble__text">{visibleSpeech}</span>
						</div>
					)}
					<BeeReticle color={agent.beeColor} active={isActive} />
					<BeeSprite beeName={beeName} state={state} color={agent.beeColor} />
				</div>
			</div>
		</div>
	)
}

export function didBeePositionMove(
	previousPosition: VecModel | null,
	currentPosition: VecModel | null
) {
	if (!previousPosition) return false
	if (!currentPosition) return false
	return (
		previousPosition.x !== currentPosition.x ||
		previousPosition.y !== currentPosition.y
	)
}

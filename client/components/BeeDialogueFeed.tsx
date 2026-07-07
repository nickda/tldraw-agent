import { useEffect, useRef } from 'react'
import { BeeDialogueLine, useBeeDialogue } from '../hooks/useBeeDialogue'
import { useAgents } from '../agent/TldrawAgentAppProvider'

/**
 * Renders one dialogue line: a colored attribution dot + bee name header,
 * then the message text below it. Exported standalone (not inlined in the
 * `.map()` call) so it can be unit tested without mounting the full
 * scrolling feed.
 */
export function renderBeeDialogueLine(line: BeeDialogueLine) {
	return (
		<div className="bee-dialogue-line" key={line.key}>
			<div className="bee-dialogue-line__attribution">
				<span
					className="bee-dialogue-line__dot"
					style={{ backgroundColor: line.beeColor }}
				/>
				<span className="bee-dialogue-line__name" style={{ color: line.beeColor }}>
					{line.beeName}
				</span>
			</div>
			<div className="bee-dialogue-line__text">{line.text}</div>
		</div>
	)
}

export function BeeDialogueFeed() {
	const agents = useAgents()
	const lines = useBeeDialogue(agents)
	const feedRef = useRef<HTMLDivElement>(null)
	const previousScrollDistanceFromBottomRef = useRef(0)

	useEffect(() => {
		if (!feedRef.current) return
		if (previousScrollDistanceFromBottomRef.current <= 0) {
			feedRef.current.scrollTo(0, feedRef.current.scrollHeight)
		}
	}, [lines])

	const handleScroll = () => {
		if (!feedRef.current) return
		const scrollDistanceFromBottom =
			feedRef.current.scrollHeight - feedRef.current.scrollTop - feedRef.current.clientHeight
		previousScrollDistanceFromBottomRef.current = scrollDistanceFromBottom
	}

	return (
		<div className="bee-dialogue-feed" ref={feedRef} onScroll={handleScroll}>
			{lines.map(renderBeeDialogueLine)}
		</div>
	)
}

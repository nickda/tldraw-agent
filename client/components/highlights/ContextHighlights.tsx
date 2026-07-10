import { useMemo } from 'react'
import { TLShapeId, useEditor, useValue } from 'tldraw'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { useAgents } from '../../agent/TldrawAgentAppProvider'
import { AreaHighlight, AreaHighlightProps } from './AreaHighlight'
import { PointHighlight, PointHighlightProps } from './PointHighlight'

/**
 * Renders context highlights for all agents.
 */
export function AllContextHighlights() {
	const agents = useAgents()

	return (
		<>
			{agents.map((agent) => (
				<ContextHighlights key={agent.id} agent={agent} />
			))}
		</>
	)
}

/**
 * Renders context highlights for a single agent.
 */
export function ContextHighlights({ agent }: { agent: TldrawAgent }) {
	const editor = useEditor()
	const selectedContextItems = useValue(
		'contextItems',
		() => (agent.requests.isGenerating() ? [] : agent.context.getItems()),
		[agent]
	)
	const activeRequest = useValue('activeRequest', () => agent.requests.getActiveRequest(), [agent])
	const activeContextItems = activeRequest?.contextItems ?? []

	// These are pure derivations of the already-reactive selectedContextItems /
	// activeContextItems, so plain useMemo is enough; wrapping each in its own
	// useValue re-registered four extra signal subscriptions per render for no
	// benefit, since selectedContextItems is itself a fresh array on every change.
	const selectedAreas: AreaHighlightProps[] = useMemo(() => {
		const selectedAreaItems = selectedContextItems.filter((item) => item.type === 'area')
		return selectedAreaItems.map((item) => {
			return {
				key: `area-${item.bounds.x}-${item.bounds.y}-${item.bounds.w}-${item.bounds.h}`,
				pageBounds: item.bounds,
				generating: false,
				color: 'var(--tl-color-selected)',
			}
		})
	}, [selectedContextItems])

	const activeAreas: AreaHighlightProps[] = useMemo(() => {
		const activeAreaItems = activeContextItems.filter((item) => item.type === 'area')
		return activeAreaItems.map((item) => {
			return {
				key: `area-${item.bounds.x}-${item.bounds.y}-${item.bounds.w}-${item.bounds.h}`,
				pageBounds: item.bounds,
				generating: true,
				color: 'var(--tl-color-selected)',
				label: item.source === 'agent' ? 'Reviewing' : undefined,
			}
		})
	}, [activeContextItems])

	const selectedShapes: AreaHighlightProps[] = useMemo(() => {
		const selectedShapeItems = selectedContextItems.filter((item) => item.type === 'shapes')
		return selectedShapeItems
			.map((item) => {
				const bounds = editor.getShapesPageBounds(
					item.shapes.map((shape) => `shape:${shape.shapeId}` as TLShapeId)
				)
				if (!bounds) return null
				return {
					key: `shapes-${item.shapes.map((shape) => shape.shapeId).join(',')}`,
					pageBounds: bounds,
					generating: false,
					color: 'var(--tl-color-selected)',
				}
			})
			.filter((highlight) => highlight !== null)
	}, [selectedContextItems, editor])

	const activeShapes: AreaHighlightProps[] = useMemo(() => {
		const activeShapeItems = activeContextItems.filter((item) => item.type === 'shapes')
		return activeShapeItems
			.map((item) => {
				const bounds = editor.getShapesPageBounds(
					item.shapes.map((shape) => `shape:${shape.shapeId}` as TLShapeId)
				)
				if (!bounds) return null
				return {
					key: `shapes-${item.shapes.map((shape) => shape.shapeId).join(',')}`,
					pageBounds: bounds,
					generating: true,
					color: 'var(--tl-color-selected)',
				}
			})
			.filter((highlight) => highlight !== null)
	}, [activeContextItems, editor])

	const selectedShapesAreas: AreaHighlightProps[] = useMemo(() => {
		const selectedShapeItems = selectedContextItems.filter((item) => item.type === 'shape')
		return selectedShapeItems
			.map((item) => {
				const bounds = editor.getShapePageBounds(`shape:${item.shape.shapeId}` as TLShapeId)
				if (!bounds) return null
				return {
					key: `shape-${item.shape.shapeId}`,
					pageBounds: bounds,
					generating: false,
					color: 'var(--tl-color-selected)',
				}
			})
			.filter((highlight) => highlight !== null)
	}, [selectedContextItems, editor])

	const activeShapeAreas: AreaHighlightProps[] = useMemo(() => {
		const activeShapeItems = activeContextItems.filter((item) => item.type === 'shape')
		return activeShapeItems
			.map((item) => {
				const bounds = editor.getShapePageBounds(`shape:${item.shape.shapeId}` as TLShapeId)
				if (!bounds) return null
				return {
					key: `shape-${item.shape.shapeId}`,
					pageBounds: bounds,
					generating: true,
					color: 'var(--tl-color-selected)',
				}
			})
			.filter((highlight) => highlight !== null)
	}, [activeContextItems, editor])

	const selectedPoints: PointHighlightProps[] = useMemo(() => {
		const selectedPointItems = selectedContextItems.filter((item) => item.type === 'point')
		return selectedPointItems.map((item) => {
			return {
				key: `point-${item.point.x}-${item.point.y}`,
				pagePoint: item.point,
				generating: false,
				color: 'var(--tl-color-selected)',
			}
		})
	}, [selectedContextItems])

	const activePoints: PointHighlightProps[] = useMemo(() => {
		const activePointItems = activeContextItems.filter((item) => item.type === 'point')
		return activePointItems.map((item) => {
			return {
				key: `point-${item.point.x}-${item.point.y}`,
				pagePoint: item.point,
				generating: true,
				color: 'var(--tl-color-selected)',
			}
		})
	}, [activeContextItems])

	const allAreaHighlights = useMemo(
		() => [
			...selectedAreas,
			...selectedShapes,
			...selectedShapesAreas,
			...activeAreas,
			...activeShapes,
			...activeShapeAreas,
		],
		[
			selectedAreas,
			selectedShapes,
			selectedShapesAreas,
			activeAreas,
			activeShapes,
			activeShapeAreas,
		]
	)

	const allPointsHighlights = useMemo(
		() => [...selectedPoints, ...activePoints],
		[selectedPoints, activePoints]
	)

	return (
		<>
			{allAreaHighlights.map((highlight) => (
				<AreaHighlight
					key={highlight.key}
					pageBounds={highlight.pageBounds}
					color={highlight.color}
					generating={highlight.generating}
					label={highlight.label}
				/>
			))}

			{allPointsHighlights.map((highlight) => (
				<PointHighlight
					key={highlight.key}
					pagePoint={highlight.pagePoint}
					color={highlight.color}
					generating={highlight.generating}
				/>
			))}
		</>
	)
}

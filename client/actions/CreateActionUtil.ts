import { IndexKey, TLShape, TLShapeId, toRichText } from 'tldraw'
import {
	convertPartialFocusedShapeToTldrawShape,
	FOCUSED_TO_GEO_TYPES,
} from '../../shared/format/convertFocusedShapeToTldrawShape'
import { FocusedShape } from '../../shared/format/FocusedShape'
import { CreateAction } from '../../shared/schema/AgentActionSchemas'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { fixInvisibleWhiteShape } from './fixInvisibleWhiteShape'

export const CreateActionUtil = registerActionUtil(
	class CreateActionUtil extends AgentActionUtil<CreateAction> {
		static override type = 'create' as const

		override getInfo(action: Streaming<CreateAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<CreateAction>, helpers: AgentHelpers) {
			const { shape } = action

			// If there's no shape yet, return action (will be filtered in applyAction)
			if (!shape) return action

			// Rewrite invisible white shapes (white solid/tint/none, non-text) to a
			// visible background fill with a grey border, so white objects like snow
			// don't vanish against the white canvas.
			fixInvisibleWhiteShape(shape)

			// Ensure the created shape has a unique ID (only if shapeId is present)
			if (shape.shapeId) {
				shape.shapeId = helpers.ensureShapeIdIsUnique(shape.shapeId)
			}

			// If the shape is an arrow and complete, ensure the from and to IDs are real shapes
			if (action.complete && shape._type === 'arrow') {
				if (shape.fromId) {
					shape.fromId = helpers.ensureShapeIdExists(shape.fromId)
				}
				if (shape.toId) {
					shape.toId = helpers.ensureShapeIdExists(shape.toId)
				}
				if ('x1' in shape) {
					shape.x1 = helpers.ensureValueIsNumber(shape.x1) ?? 0
				}
				if ('y1' in shape) {
					shape.y1 = helpers.ensureValueIsNumber(shape.y1) ?? 0
				}
				if ('x2' in shape) {
					shape.x2 = helpers.ensureValueIsNumber(shape.x2) ?? 0
				}
				if ('y2' in shape) {
					shape.y2 = helpers.ensureValueIsNumber(shape.y2) ?? 0
				}
				if ('bend' in shape) {
					shape.bend = helpers.ensureValueIsNumber(shape.bend) ?? 0
				}
			}

			// Clamp zero/negative dimensions to a minimum of 1. The tldraw store
			// rejects geo shapes with w=0 or h=0.
			if ('w' in shape && (shape as any).w <= 0) (shape as any).w = 1
			if ('h' in shape && (shape as any).h <= 0) (shape as any).h = 1

			return action
		}

		override applyAction(action: Streaming<CreateAction>, helpers: AgentHelpers) {
			const { editor } = this
			const { shape } = action

			// If there's no shape yet, return early
			if (!shape || !shape._type) return

			// Note: `draw` shapes can no longer reach here. CreateAction's schema
			// (CreatableShapeSchema) excludes draw + unknown shapes, so the model
			// cannot emit a draw shape via create at all. Draw shapes created this
			// way had no segments and crashed the geometry layer with
			// "Polyline2d: points must be an array of at least 2 points"; freeform
			// strokes must use the `pen` action instead.

			// Translate the shape back to the chat's position
			const shapePartial = helpers.removeOffsetFromShapePartial(shape)

			const result = convertPartialFocusedShapeToTldrawShape(editor, shapePartial, {
				defaultShape: getDefaultShape(shape._type, action.complete),
				complete: action.complete,
				// Streaming shapes without an explicit id fall back to an id scoped to
				// this agent, so concurrent executors (Team Mode) never clobber each
				// other's in-progress shape.
				fallbackShapeId: `streaming-shape-${this.agent.id}` as SimpleShapeId,
			})

			if (!result.shape) return

			editor.createShape(result.shape)

			// Handle arrow bindings if they exist
			if (result.bindings) {
				for (const binding of result.bindings) {
					editor.createBinding({
						type: binding.type,
						fromId: binding.fromId,
						toId: binding.toId,
						props: binding.props,
						meta: binding.meta,
					})
				}
			}
		}
	}
)

function getDefaultShape(shapeType: FocusedShape['_type'], complete: boolean): Partial<TLShape> {
	const isGeo = shapeType in FOCUSED_TO_GEO_TYPES
	const defaultShape = isGeo
		? SHAPE_DEFAULTS.geo
		: (SHAPE_DEFAULTS[shapeType as keyof typeof SHAPE_DEFAULTS] ?? SHAPE_DEFAULTS.unknown)
	return complete ? defaultShape : { ...defaultShape, isLocked: true }
}

type BaseShapeDefaults = Pick<TLShape, 'id' | 'isLocked' | 'opacity' | 'rotation' | 'meta'>

const SHARED_DEFAULTS: BaseShapeDefaults = {
	isLocked: false,
	opacity: 1,
	rotation: 0,
	meta: {},
	id: 'shape:shape' as TLShapeId,
}

type ShapeDefaults<T extends TLShape = TLShape> = BaseShapeDefaults & {
	props?: Partial<T['props']>
}

type SupportedShapeTypes = 'text' | 'line' | 'arrow' | 'geo' | 'note' | 'draw'

type ShapeDefaultsMap = {
	[K in SupportedShapeTypes]: ShapeDefaults<TLShape<K>>
} & {
	unknown: ShapeDefaults
}

const SHAPE_DEFAULTS: ShapeDefaultsMap = {
	text: {
		...SHARED_DEFAULTS,
		props: {
			autoSize: true,
			color: 'black',
			font: 'draw',
			richText: toRichText(''),
			scale: 1,
			size: 's',
			textAlign: 'start',
			w: 100,
		},
	},
	line: {
		...SHARED_DEFAULTS,
		props: {
			size: 's',
			color: 'black',
			dash: 'draw',
			points: {
				a1: {
					id: 'a1',
					index: 'a1' as IndexKey,
					x: 0,
					y: 0,
				},
				a2: {
					id: 'a2',
					index: 'a2' as IndexKey,
					x: 100,
					y: 0,
				},
			},
			scale: 1,
			spline: 'line',
		},
	},
	arrow: {
		...SHARED_DEFAULTS,
		props: {
			arrowheadEnd: 'arrow',
			arrowheadStart: 'none',
			bend: 0,
			color: 'black',
			dash: 'draw',
			elbowMidPoint: 0.5,
			end: { x: 100, y: 0 },
			fill: 'none',
			font: 'draw',
			kind: 'arc',
			labelColor: 'black',
			labelPosition: 0.5,
			richText: toRichText(''),
			scale: 1,
			size: 's',
			start: { x: 0, y: 0 },
		},
	},
	geo: {
		...SHARED_DEFAULTS,
		props: {
			align: 'middle',
			color: 'black',
			dash: 'draw',
			fill: 'none',
			font: 'draw',
			geo: 'rectangle',
			growY: 0,
			h: 100,
			labelColor: 'black',
			richText: toRichText(''),
			scale: 1,
			size: 's',
			url: '',
			verticalAlign: 'middle',
			w: 100,
		},
	},
	note: {
		...SHARED_DEFAULTS,
		props: {
			color: 'black',
			richText: toRichText(''),
			size: 's',
			align: 'middle',
			font: 'draw',
			fontSizeAdjustment: 0,
			growY: 0,
			labelColor: 'black',
			scale: 1,
			url: '',
			verticalAlign: 'middle',
		},
	},
	draw: {
		...SHARED_DEFAULTS,
		props: {},
	},
	unknown: {
		...SHARED_DEFAULTS,
		props: {},
	},
}

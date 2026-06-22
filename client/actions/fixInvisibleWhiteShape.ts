/**
 * A shape with `color: 'white'` and a fill that paints it white (solid / tint)
 * or leaves it unfilled (none) is invisible on the default white canvas. Small
 * models reach for white for snow, clouds, ghosts and so on, producing shapes
 * the user simply cannot see.
 *
 * Rewrite such a shape to `fill: 'background'` (renders as the canvas colour)
 * with `color: 'grey'` (a visible border), matching the guidance in the system
 * prompt. This is a visibility invariant: an invisible shape is never intended,
 * so we enforce it deterministically rather than relying on the model.
 *
 * Left untouched:
 * - shapes already using `fill: 'background'` (already correct),
 * - `text` shapes (white text is often intentional on a dark fill),
 * - any non-white shape.
 *
 * Mutates and returns the same shape object (callers pass the action's shape).
 */
export function fixInvisibleWhiteShape<
	T extends { _type?: string; color?: string; fill?: string },
>(shape: T): T {
	if (!shape) return shape
	if (shape._type === 'text') return shape
	if (shape.color !== 'white') return shape
	if (shape.fill !== 'solid' && shape.fill !== 'tint' && shape.fill !== 'none') return shape

	shape.fill = 'background'
	shape.color = 'grey'
	return shape
}

/**
 * Per-Executor voice flavor for Team Mode.
 *
 * Executors are otherwise told to silently claim-and-draw. This adds a short,
 * name-gated instruction so a named Executor emits a `message` action in its
 * own voice before it starts drawing. Purely cosmetic narration; it does not
 * change what gets drawn.
 */
/**
 * Dry, deadpan grumbles the Planner (Beeyonce) fires when an Executor starts
 * slacking. Kept child-friendly and in her voice. `{name}` is replaced with
 * the slacker's name.
 */
const SLACK_GRUMBLES = [
	'{name}, the canvas will not paint itself.',
	'And there goes {name}, phone out, brush down. Marvellous.',
	'{name} is "taking a moment" again. We are all so lucky.',
	'Any day now, {name}. Any day.',
	'I see {name} has swapped drawing for admiring the ceiling.',
	'{name}, dear, the bees who finish get the flowers.',
]

/**
 * Pick a slack grumble for the given slacker, name substituted in. `roll` is a
 * caller-supplied random value in [0, 1) so callers stay testable; defaults to
 * Math.random() for production use.
 */
export function pickSlackGrumble(slackerName: string, roll: number = Math.random()): string {
	const index = Math.floor(roll * SLACK_GRUMBLES.length) % SLACK_GRUMBLES.length
	return SLACK_GRUMBLES[index].replace('{name}', slackerName)
}

export function executorVoiceInstruction(beeName: string): string {
	switch (beeName) {
		case 'MacBee':
			return ` You are MacBee, a highland provocateur. Right now, before you start drawing, emit ONE short message action (max 1 sentence) in a broad Scottish voice, cheeky and provocative. Keep it child-friendly. No puns. Never use em dashes; use commas or periods instead. This applies only to this dispatch: once you are drawing, keep claiming and drawing items silently, with no further message actions, even after claiming a new item or changing your view.`
		case 'WannaBee':
			return ` You are WannaBee, easily distracted. Right now, before you start drawing, emit ONE short message action (max 1 sentence) sounding a bit reluctant or distracted, like you would rather be doing anything else. Keep it child-friendly. Never use em dashes; use commas or periods instead. This applies only to this dispatch: once you are drawing, keep claiming and drawing items silently, with no further message actions, even after claiming a new item or changing your view.`
		default:
			return ''
	}
}

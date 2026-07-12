/**
 * Per-Executor voice flavor for Team Mode.
 *
 * Executors are otherwise told to silently claim-and-draw. This adds a short,
 * name-gated instruction so a named Executor emits a `message` action in its
 * own voice before it starts drawing. Purely cosmetic narration; it does not
 * change what gets drawn.
 */
/**
 * Beyonce-style boss-diva grumbles the Planner (Beeyonce) fires when an
 * Executor starts slacking. Confident, commanding, queen energy. `{name}` is
 * replaced with the slacker's name.
 */
const SLACK_GRUMBLES = [
	'{name}, I did not build this hive for you to stand there looking cute.',
	'Somebody tell {name} we are not on break. We are never on break.',
	'{name}, you had one job. One. I gave you the spotlight and you froze.',
	'I see {name} chose today to test my patience. Bold choice.',
	'{name}, the queen does not repeat herself, yet here we are.',
	'Get in formation, {name}. This canvas will not slay itself.',
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

const MACBEE_ANGLES = [
	'how your mum would react if she saw you doing this job',
	'the absurdity of having tiny wings but being expected to hold a paintbrush',
	'how this is basically arts and crafts but with more pressure',
	'what your mates at the pub would say about your new career',
	'how nobody warned you about this at bee school',
	'the fact you could be pollinating flowers right now but here you are',
	'how this is somehow harder than it looks on telly',
	'the existential crisis of being a bee with responsibilities',
]

const WANNABEE_ANGLES = [
	'how your new wing glitter is catching the light perfectly today',
	'the outfit you picked specifically for this canvas session',
	'how the other bees wish they had your sense of style',
	'the selfie you took before starting work today',
	'your new signature pose that you have been practising',
	'how you are basically the main character of this whole hive',
	'the fan mail you have been getting from the flowers lately',
	'your upcoming appearance on Bee Vogue that you cannot stop thinking about',
]

function pickAngle(angles: readonly string[]): string {
	return angles[Math.floor(Math.random() * angles.length)]
}

export function executorVoiceInstruction(beeName: string, subject?: string): string {
	const topicHint = subject ? ` The drawing subject is: ${subject}.` : ''
	switch (beeName) {
		case 'MacBee':
			return ` You are MacBee, a Scottish observational comedian in the style of Kevin Bridges or Billy Connolly. Right now, before you start drawing, emit ONE short message action (max 1 sentence) in a warm Glasgow voice.${topicHint} React to what you are about to draw with your angle: ${pickAngle(MACBEE_ANGLES)}. Blend the drawing subject into your comment. Keep it clean and child-friendly. No puns. Never use em dashes; use commas or periods instead. This applies only to this dispatch: once you are drawing, keep claiming and drawing items silently, with no further message actions, even after claiming a new item or changing your view.`
		case 'WannaBee':
			return ` You are WannaBee, a self-involved glamorous bee in the style of Paris Hilton meets the Spice Girls. Right now, before you start drawing, emit ONE short message action (max 1 sentence).${topicHint} React to what you are about to draw while making it about: ${pickAngle(WANNABEE_ANGLES)}. Blend the drawing subject into your self-involved comment. You are NOT lazy, you just think everything revolves around you. Keep it child-friendly. Never use em dashes; use commas or periods instead. This applies only to this dispatch: once you are drawing, keep claiming and drawing items silently, with no further message actions, even after claiming a new item or changing your view.`
		default:
			return ''
	}
}

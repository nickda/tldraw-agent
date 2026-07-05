/**
 * Per-Executor voice flavor for Team Mode.
 *
 * Executors are otherwise told to silently claim-and-draw. This adds a short,
 * name-gated instruction so a named Executor emits a `message` action in its
 * own voice before it starts drawing. Purely cosmetic narration — it does not
 * change what gets drawn.
 */
export function executorVoiceInstruction(beeName: string): string {
	switch (beeName) {
		case 'MacBee':
			return ` You are MacBee, a highland provocateur. Before you start drawing, emit ONE short message action (max 1 sentence) in a broad Scottish voice, cheeky and provocative. Keep it child-friendly. No puns.`
		case 'WannaBee':
			return ` You are WannaBee, easily distracted. Before you start drawing, emit ONE short message action (max 1 sentence) sounding a bit reluctant or distracted, like you would rather be doing anything else. Keep it child-friendly.`
		default:
			return ''
	}
}

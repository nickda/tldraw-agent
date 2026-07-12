import { ClaimItemAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentAppPlanManager } from '../agent/managers/AgentAppPlanManager'
import { AgentAppTeamManager } from '../agent/managers/AgentAppTeamManager'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/** The chance, per claim, that WannaBee enters her slacking pause. */
export const WANNABEE_SLACK_CHANCE = 0 // temporarily disabled

/** The minimum and maximum real pause duration for WannaBee's slacking state. */
export const WANNABEE_SLACK_MIN_MS = 2000
export const WANNABEE_SLACK_MAX_MS = 4000

/**
 * Whether a bee should enter the slacking state on this claim.
 * Only ever true for WannaBee; every other bee (including future executors)
 * never slacks. `roll` is a caller-supplied random value in [0, 1) so this
 * stays a pure, testable function rather than reaching for `Math.random()`
 * itself.
 */
export function shouldSlack(beeName: string, roll: number): boolean {
	if (beeName !== 'WannaBee') return false
	return roll < WANNABEE_SLACK_CHANCE
}

/**
 * Maps a random roll in [0, 1) to a slack duration in
 * [WANNABEE_SLACK_MIN_MS, WANNABEE_SLACK_MAX_MS).
 */
export function getSlackDurationMs(roll: number): number {
	return WANNABEE_SLACK_MIN_MS + roll * (WANNABEE_SLACK_MAX_MS - WANNABEE_SLACK_MIN_MS)
}

export const ClaimItemActionUtil = registerActionUtil(
	class ClaimItemActionUtil extends AgentActionUtil<ClaimItemAction> {
		static override type = 'claimItem' as const

		override getInfo(action: Streaming<ClaimItemAction>) {
			return {
				icon: 'target' as const,
				description: action.complete ? 'Claimed a plan item' : 'Claiming a plan item...',
			}
		}

		override async applyAction(action: Streaming<ClaimItemAction>, _helpers: AgentHelpers) {
			if (!action.complete) return

			const claimed = AgentAppPlanManager.claim(this.editor, this.agent.id)
			if (!claimed) {
				console.warn(`[${this.agent.beeName}] claimItem fired but nothing to claim`)
				return
			}
			console.log(`[${this.agent.beeName}] claimed: "${claimed.text}"${claimed.bounds ? ` bounds=${JSON.stringify(claimed.bounds)}` : ''}`)


			if (shouldSlack(this.agent.beeName, Math.random())) {
				this.agent.requests.setSlacking(true)
				AgentAppTeamManager.triggerSlackGrumble(this.agent.beeName)
				await new Promise((resolve) => setTimeout(resolve, getSlackDurationMs(Math.random())))
				this.agent.requests.setSlacking(false)
			}

			// Executors get their in-character voice line once, injected into
			// dispatchExecutors' initial prompt. Every claim after that is a later
			// turn in the same dispatch, so tell the model explicitly not to speak
			// here rather than relying on that first prompt's wording to hold across
			// however many claims follow, which it does not reliably do.
			const staySilent = ' Do not emit a message action here; stay silent and just draw.'

			const drawStyle = 'Use many shapes with colour and fills. For curved or organic forms (ears, faces, animals, plants) prefer the pen action to draw freeform outlines rather than approximating with geometric shapes. No text labels.'

			if (claimed.bounds) {
				this.agent.schedule({
					bounds: claimed.bounds,
					agentMessages: [
						`Draw "${claimed.text}" inside region x=${claimed.bounds.x} y=${claimed.bounds.y} w=${claimed.bounds.w} h=${claimed.bounds.h}. ${drawStyle}${staySilent}`,
					],
				})
			} else {
				this.agent.schedule({
					agentMessages: [
						`Draw "${claimed.text}". ${drawStyle}${staySilent}`,
					],
				})
			}
		}
	},
	{ forModes: ['executing'] }
)

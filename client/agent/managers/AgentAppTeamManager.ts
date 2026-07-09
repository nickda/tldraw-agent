import { generateAgentId } from './AgentAppAgentsManager'
import { AgentAppPlanManager } from './AgentAppPlanManager'
import { shouldStartReview, MAX_REVIEW_ROUNDS } from './sharedPlan'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { TldrawAgent } from '../TldrawAgent'
import type { TldrawAgentApp } from '../TldrawAgentApp'
import { getTeamBeeSpawnPosition } from '../../utils/beePosition'
import { pickSlackGrumble } from '../executorVoice'

const PLANNER_COLOR = '#6366f1'
const EXECUTOR_COLORS = ['#f59e0b', '#10b981']

/** How long the Planner lingers at each drawn item while touring the canvas during a review. */
const REVIEW_TOUR_STOP_MS = 2800

/** The Planner's fixed name in Team Mode. Team Mode always has exactly one planner. */
export const PLANNER_BEE_NAME = 'Beeyonce'

/**
 * The Executors' fixed names in Team Mode, in spawn order. Team Mode always
 * spawns exactly two executors, so index 0 is always MacBee and index 1 is
 * always WannaBee.
 */
export const EXECUTOR_BEE_NAMES = ['MacBee', 'WannaBee']

/**
 * Orchestrates Team Mode: creates the Planner and Executor Bees, routes user
 * prompts to the Planner, and runs the reactive review-loop coordinator.
 */
export class AgentAppTeamManager extends BaseAgentAppManager {
	private static instance: AgentAppTeamManager | null = null

	private planner: TldrawAgent | null = null
	private executors: TldrawAgent[] = []
	private reviewGuard = false
	private isDisposing = false

	constructor(app: TldrawAgentApp) {
		super(app)
		AgentAppTeamManager.instance = this
	}

	static triggerReviewCheck() {
		AgentAppTeamManager.instance?.checkReviewLoop()
	}

	/**
	 * Make the Planner (Beeyonce) grumble about an Executor slacking. Called
	 * from ClaimItemActionUtil when WannaBee enters her slacking pause, so the
	 * queen reliably reacts instead of only maybe mentioning it in narration.
	 */
	static triggerSlackGrumble(slackerName: string) {
		AgentAppTeamManager.instance?.grumbleAboutSlacker(slackerName)
	}

	private grumbleAboutSlacker(slackerName: string) {
		if (!this.planner) return
		const grumble = pickSlackGrumble(slackerName)
		this.planner.chat.push({
			type: 'action',
			action: { _type: 'message', text: grumble, complete: true, time: 0 },
			diff: { added: {}, updated: {}, removed: {} },
			acceptance: 'accepted',
		})
	}

	/**
	 * Activate Team Mode by spawning the team (if not already present).
	 */
	activate() {
		if (this.planner) return

		// Check if team agents already exist (restored from persistence)
		const existingAgents = this.app.agents.getAgents()
		const existingPlanner = existingAgents.find((a) => a.role === 'planner')
		const existingExecutors = existingAgents.filter((a) => a.role === 'executor')

		if (existingPlanner && existingExecutors.length >= 2) {
			this.planner = existingPlanner
			this.executors = existingExecutors.slice(0, 2)
			// Remove solo agent(s)
			const soloAgents = existingAgents.filter((a) => a.role === 'solo')
			for (const solo of soloAgents) {
				this.app.agents.deleteAgent(solo.id)
			}
			return
		}

		const viewportBounds = this.app.editor.getViewportPageBounds()

		// Remove solo agent(s) first since we create team atomically below
		const soloAgents = existingAgents.filter((a) => a.role === 'solo')
		for (const solo of soloAgents) {
			this.app.agents.deleteAgent(solo.id)
		}

		// Create all 3 team agents in one batch, with fixed names by role/position
		this.planner = this.app.agents.createAgent(generateAgentId(), {
			role: 'planner',
			beeName: PLANNER_BEE_NAME,
			beeColor: PLANNER_COLOR,
		})
		this.planner.mode.setMode('planning')
		this.planner.requests.setBeePosition(getTeamBeeSpawnPosition(viewportBounds, 0))

		for (let i = 0; i < 2; i++) {
			const executor = this.app.agents.createAgent(generateAgentId(), {
				role: 'executor',
				beeName: EXECUTOR_BEE_NAMES[i],
				beeColor: EXECUTOR_COLORS[i],
			})
			// Don't set mode to 'executing' here. Leave in 'idling' so that
			// when dispatched, idling.onPromptStart transitions to 'executing'.
			executor.requests.setBeePosition(getTeamBeeSpawnPosition(viewportBounds, i + 1))
			this.executors.push(executor)
		}
	}

	/**
	 * Whether Team Mode is currently active (team spawned).
	 */
	isActive(): boolean {
		return this.planner !== null
	}

	/**
	 * Get the Planner agent.
	 */
	getPlanner(): TldrawAgent | null {
		return this.planner
	}

	/**
	 * Get the Executor agents.
	 */
	getExecutors(): TldrawAgent[] {
		return this.executors
	}

	/**
	 * Check if the review loop should trigger. Called from executing.onPromptEnd
	 * when an executor finishes and goes idle (deferred by setTimeout to let
	 * isGenerating clear).
	 */
	checkReviewLoop() {
		if (!this.planner) return
		if (this.reviewGuard) return

		setTimeout(async () => {
			const plan = AgentAppPlanManager.getPlan(this.app.editor)
			const reviewRound = AgentAppPlanManager.getReviewRound(this.app.editor)

			if (plan.length === 0) return

			const executorsIdle = this.executors.every((e) => !e.requests.isGenerating())

			if (this.reviewGuard) return

			if (shouldStartReview({ plan, executorsIdle, reviewRound })) {
				this.reviewGuard = true
				this.app.plan.incrementReviewRound()

				if (reviewRound + 1 >= MAX_REVIEW_ROUNDS) {
					this.planner?.interrupt({
						input: {
							agentMessages: [
								'All plan items are done and reviews are complete. Send a final message to the user (in your dry witty voice) summarizing what was drawn and any improvements made during review.',
							],
							source: 'self',
						},
					})
				} else if (reviewRound === 0) {
					this.planner?.interrupt({
						input: {
							agentMessages: [
								'All plan items are done. First, send a message (in your dry witty voice) describing what you see. Then critically review. Check: overlapping/occlusion (are objects covering faces or important parts? Use sendToBack/bringToFront to fix z-order), alignment, proportions, disconnected elements. Your bar for "needs fixing" should be LOW. Use delegateFix for EVERY issue. Only say complete if genuinely nothing to improve.',
							],
							source: 'self',
						},
					})
				} else {
					this.planner?.interrupt({
						input: {
							agentMessages: [
								'You already reviewed this scene once. Do not re-describe or re-check areas you already passed. Verify only the fixes you just delegated and anything they touched: did each fix land correctly, and did it introduce a new overlap, alignment, or proportion issue nearby? Do not use the think action here; go straight to delegateFix for anything still wrong. Only send a message if there is something new to flag or you are genuinely done; a short "looks good" is fine.',
							],
							source: 'self',
						},
					})
				}

				// Keep her walking the done items for as long as she's actually
				// generating the review, instead of finishing a fixed tour before
				// the call even starts and then sitting frozen through the (often
				// much longer) generation itself.
				this.animateReviewTourWhileGenerating()

				// Release the guard only once the review request has actually
				// finished generating, not after a fixed delay. A review can
				// legitimately run for many seconds, and staggered executor
				// completions used to release the guard early and double-trigger
				// a second review while the first was still in flight.
				await this.waitForPlannerIdle()
				this.reviewGuard = false
			}
		}, 50)
	}

	/**
	 * Wait until the review request has started generating and then finished,
	 * so callers can release re-entrancy guards based on real request state
	 * instead of a fixed timer. `interrupt()`'s scheduled request only flips
	 * `isGenerating()` true once it actually starts streaming, so we first wait
	 * (bounded) for that to happen before waiting for it to go false again.
	 * Otherwise a check made before the request starts would see `false` and
	 * return immediately, as if the review had already finished. If the
	 * planner disappears (reset/dispose racing in) or the scheduled request
	 * never starts (e.g. it throws before setting isPrompting), the start-wait
	 * bails out via the same bounded loop rather than treating either case as
	 * "still waiting to start" for the full timeout.
	 */
	private async waitForPlannerIdle(): Promise<void> {
		const poll = () => new Promise((resolve) => setTimeout(resolve, 100))
		const maxStartWaitMs = 5000
		let waited = 0
		while (this.planner && !this.planner.requests.isGenerating() && waited < maxStartWaitMs) {
			await poll()
			waited += 100
		}
		while (this.planner?.requests.isGenerating()) {
			await poll()
		}
	}

	private async animateReviewTourWhileGenerating(): Promise<void> {
		const planner = this.planner
		if (!planner) return

		const plan = AgentAppPlanManager.getPlan(this.app.editor)
		const stops = plan
			.filter((item) => item.status === 'done' && item.bounds)
			.map((item) => ({
				x: item.bounds!.x + item.bounds!.w / 2,
				y: item.bounds!.y + item.bounds!.h / 2,
			}))

		if (stops.length === 0) return

		// Let the interrupt's scheduled request actually start streaming before
		// checking isGenerating, which only flips true once the request begins.
		await new Promise((resolve) => setTimeout(resolve, REVIEW_TOUR_STOP_MS))

		let i = 0
		while (planner.requests.isGenerating()) {
			planner.requests.setBeePosition(stops[i % stops.length])
			i++
			await new Promise((resolve) => setTimeout(resolve, REVIEW_TOUR_STOP_MS))
		}
	}


	reset(): void {
		const wasActive = this.planner !== null

		if (this.planner) {
			this.app.agents.deleteAgent(this.planner.id)
			this.planner = null
		}
		for (const executor of this.executors) {
			this.app.agents.deleteAgent(executor.id)
		}
		this.executors = []
		this.reviewGuard = false

		// Restore a solo agent if team was active, unless we're mid-disposal:
		// persistence watchers are already torn down by then, and the replacement
		// agent would just get disposed again immediately after.
		if (wasActive && !this.isDisposing) {
			this.app.agents.ensureAtLeastOneAgent()
		}
	}

	override dispose(): void {
		this.isDisposing = true
		this.reset()
		super.dispose()
		if (AgentAppTeamManager.instance === this) {
			AgentAppTeamManager.instance = null
		}
	}
}

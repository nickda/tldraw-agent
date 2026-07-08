import { generateAgentId } from './AgentAppAgentsManager'
import { AgentAppPlanManager } from './AgentAppPlanManager'
import { shouldStartReview, MAX_REVIEW_ROUNDS } from './sharedPlan'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { TldrawAgent } from '../TldrawAgent'
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
	private coordinatorCleanup: (() => void) | null = null
	private reviewGuard = false

	constructor(app: any) {
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
	 * Activate Team Mode by spawning the team (if not already present) and
	 * starting the reactive coordinator.
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
			this.startCoordinator()
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

		this.startCoordinator()
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
	 * Route a user prompt to the Planner via interrupt (safe if already generating).
	 */
	promptPlanner(message: string) {
		if (!this.planner) return
		this.planner.interrupt({
			input: {
				agentMessages: [
					`You are ${PLANNER_BEE_NAME}, the Queen Bee planner. Decompose this user request into a Shared Plan using the writePlan action. Each plan item must have: text (what to draw), and disjoint bounds (x, y, w, h) so Executors draw in separate regions. After writing the plan, use dispatchExecutors to start the Executors.\n\nUser request: ${message}`,
				],
				source: 'user',
			},
		})
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

				setTimeout(() => {
					this.reviewGuard = false
				}, 100)
			}
		}, 50)
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


	private startCoordinator() {
		// No-op: review loop is now triggered explicitly via checkReviewLoop()
		// called from executing.onPromptEnd when executor goes idle.
	}

	reset(): void {
		if (this.coordinatorCleanup) {
			this.coordinatorCleanup()
			this.coordinatorCleanup = null
		}

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

		// Restore a solo agent if team was active
		if (wasActive) {
			this.app.agents.ensureAtLeastOneAgent()
		}
	}

	override dispose(): void {
		this.reset()
		super.dispose()
	}
}

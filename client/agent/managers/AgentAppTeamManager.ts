import { react } from 'tldraw'
import { generateAgentId } from './AgentAppAgentsManager'
import { AgentAppPlanManager } from './AgentAppPlanManager'
import { shouldStartReview, MAX_REVIEW_ROUNDS } from './sharedPlan'
import { BaseAgentAppManager } from './BaseAgentAppManager'
import { TldrawAgent } from '../TldrawAgent'
import { getTeamFairySpawnPosition } from '../../utils/fairyPosition'

const PLANNER_COLOR = '#6366f1'
const EXECUTOR_COLORS = ['#f59e0b', '#10b981']

/**
 * Orchestrates Team Mode: creates the Planner and Executor Fairies, routes user
 * prompts to the Planner, and runs the reactive review-loop coordinator.
 */
export class AgentAppTeamManager extends BaseAgentAppManager {
	private planner: TldrawAgent | null = null
	private executors: TldrawAgent[] = []
	private coordinatorCleanup: (() => void) | null = null
	private reviewGuard = false

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

		// Create all 3 team agents in one batch
		this.planner = this.app.agents.createAgent(generateAgentId(), {
			role: 'planner',
			fairyColor: PLANNER_COLOR,
		})
		this.planner.mode.setMode('planning')
		this.planner.requests.setFairyPosition(getTeamFairySpawnPosition(viewportBounds, 0))

		for (let i = 0; i < 2; i++) {
			const executor = this.app.agents.createAgent(generateAgentId(), {
				role: 'executor',
				fairyColor: EXECUTOR_COLORS[i],
			})
			executor.mode.setMode('executing')
			executor.requests.setFairyPosition(getTeamFairySpawnPosition(viewportBounds, i + 1))
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
					`You are the Planner Fairy. Decompose this user request into a Shared Plan using the writePlan action. Each plan item must have: text (what to draw), and disjoint bounds (x, y, w, h) so Executors draw in separate regions. After writing the plan, use dispatchExecutors to start the Executors.\n\nUser request: ${message}`,
				],
				source: 'user',
			},
		})
	}

	/**
	 * Start the reactive coordinator that watches for plan completion and
	 * triggers the Review Loop.
	 */
	private startCoordinator() {
		this.coordinatorCleanup = react('team-mode-coordinator', () => {
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
								'All plan items are done and the maximum review rounds have been reached. Send a final summary message to the user describing what was accomplished.',
							],
							source: 'self',
						},
					})
				} else {
					this.planner?.interrupt({
						input: {
							agentMessages: [
								'All plan items are done. Review the canvas against the original plan. If anything needs fixing, use delegateFix to assign corrections to a specific Executor. If everything looks good, send a summary message to the user.',
							],
							source: 'self',
						},
					})
				}

				setTimeout(() => {
					this.reviewGuard = false
				}, 100)
			}
		})
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

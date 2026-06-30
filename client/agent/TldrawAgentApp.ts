import { Editor } from 'tldraw'
import { TldrawAgent } from './TldrawAgent'
import { AgentAppAgentsManager } from './managers/AgentAppAgentsManager'
import { AgentAppPersistenceManager } from './managers/AgentAppPersistenceManager'
import { AgentAppPlanManager } from './managers/AgentAppPlanManager'
import { AgentAppTeamManager } from './managers/AgentAppTeamManager'

/**
 * The TldrawAgentApp class manages the agent system for a given editor instance.
 *
 * This is a coordinator class that handles app-level concerns shared across agents,
 * such as agent lifecycle management, persistence, and global settings.
 *
 * Individual agents (TldrawAgent) handle their own concerns like chat, context, and requests.
 * The app manages the agents and coordinates shared state.
 *
 * @example
 * ```tsx
 * const app = new TldrawAgentApp(editor, { onError: handleError })
 * const agent = app.agents.getAgent()
 * agent.prompt('Draw a cat')
 * ```
 */
export class TldrawAgentApp {
	/**
	 * Manager for agent lifecycle - creation, disposal, and tracking.
	 */
	agents: AgentAppAgentsManager

	/**
	 * Manager for state persistence - loading, saving, and auto-save.
	 */
	persistence: AgentAppPersistenceManager

	/**
	 * Manager for the Shared Plan in Team Mode - the list of Plan Items the
	 * Planner writes and the Executors claim from.
	 */
	plan: AgentAppPlanManager

	/**
	 * Manager for Team Mode orchestration - spawns the team and coordinates
	 * the review loop.
	 */
	team: AgentAppTeamManager

	/**
	 * Handle crash and dispose events.
	 */
	private handleCrash = () => this.dispose()
	private handleDispose = () => this.dispose()

	private _editor: Editor | null

	/**
	 * The editor associated with this app.
	 * @throws Error if the app has been disposed.
	 */
	get editor(): Editor {
		if (!this._editor) {
			throw new Error('TldrawAgentApp has been disposed')
		}
		return this._editor
	}

	constructor(
		editor: Editor,
		public options: {
			onError: (e: any) => void
		}
	) {
		this._editor = editor
		this.agents = new AgentAppAgentsManager(this)
		this.persistence = new AgentAppPersistenceManager(this)
		this.plan = new AgentAppPlanManager(this)
		this.team = new AgentAppTeamManager(this)
		editor.on('crash', this.handleCrash)
		editor.on('dispose', this.handleDispose)
	}

	/**
	 * Dispose of all resources. Call this during cleanup.
	 */
	dispose() {
		if (!this._editor) return
		this._editor.off('crash', this.handleCrash)
		this._editor.off('dispose', this.handleDispose)
		this.persistence.dispose()
		this.team.dispose()
		this.plan.dispose()
		this.agents.dispose()
		this._editor = null
	}

	/**
	 * Whether Team Mode is enabled. When true, user prompts route through
	 * the Planner rather than the solo agent.
	 */
	get teamModeEnabled(): boolean {
		return this.team.isActive()
	}

	/**
	 * The agent that should receive user input: the Planner if Team Mode is
	 * active, or the first (solo) agent otherwise.
	 */
	getUserFacingAgent(): TldrawAgent | undefined {
		if (this.team.isActive()) {
			return this.team.getPlanner() ?? undefined
		}
		return this.agents.getAgent()
	}

	/**
	 * Reset everything to initial state.
	 */
	reset() {
		this.team.reset()
		this.agents.reset()
		this.persistence.reset()
		this.plan.reset()
	}
}

import { Editor, RecordsDiff, reverseRecordsDiff, structuredClone, TLRecord, TLShapeId } from 'tldraw'
import {
	convertTldrawIdToSimpleId,
	convertTldrawShapeToFocusedShape,
} from '../../shared/format/convertTldrawShapeToFocusedShape'
import { AgentModelName } from '../../shared/models'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentInput } from '../../shared/types/AgentInput'
import { AgentPrompt, BaseAgentPrompt } from '../../shared/types/AgentPrompt'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { ChatHistoryItem, ChatHistoryPromptItem } from '../../shared/types/ChatHistoryItem'
import { ContextItem } from '../../shared/types/ContextItem'
import { PromptPart } from '../../shared/types/PromptPart'
import { Streaming } from '../../shared/types/Streaming'
import { TodoItem } from '../../shared/types/TodoItem'
import { AgentHelpers } from '../AgentHelpers'
import { getModeNode } from '../modes/AgentModeChart'
import { AgentModeType } from '../modes/AgentModeDefinitions'
import { getPromptPartUtilsRecord, PromptPartUtil } from '../parts/PromptPartUtil'
import { capChatHistory } from '../utils/capChatHistory'
import { extractBeePosition, extractBeePositionFromDiff, getBeePositionFromBounds } from '../utils/beePosition'
import { generateFairyName } from '../utils/generateFairyName'
import { AgentActionManager } from './managers/AgentActionManager'
import { AgentChatManager } from './managers/AgentChatManager'
import { AgentChatOriginManager } from './managers/AgentChatOriginManager'
import { AgentContextManager } from './managers/AgentContextManager'
import { AgentDebugFlags, AgentDebugManager } from './managers/AgentDebugManager'
import { AgentLintManager } from './managers/AgentLintManager'
import { AgentModeManager } from './managers/AgentModeManager'
import { AgentModelNameManager } from './managers/AgentModelNameManager'
import { AgentRequestManager } from './managers/AgentRequestManager'
import { AgentTodoManager } from './managers/AgentTodoManager'
import { AgentUserActionTracker } from './managers/AgentUserActionTracker'

/**
 * The role a Bee plays in a Team Mode run.
 * - `planner`: decomposes the request into the Shared Plan and reviews (one).
 * - `executor`: claims and draws Plan Items (two).
 * - `solo`: the single-agent path, behaving exactly as before Team Mode.
 *
 * The role is a stable property of the agent, distinct from its (ephemeral)
 * mode and its cosmetic Bee name. It is persisted so the team is stable
 * across reloads.
 */
export type AgentRole = 'planner' | 'executor' | 'solo'

/**
 * The default Bee sprite colour, matching the pre-Team-Mode look. Used by the
 * solo agent so the single-agent path is visually unchanged.
 */
export const DEFAULT_BEE_COLOR = '#111'

/**
 * Safety cap on the post-prompt mode-transition loop in `prompt()`. Bounds
 * the case where two modes' `onPromptEnd` hooks transition into each other,
 * which would otherwise loop forever.
 */
export const MAX_MODE_TRANSITIONS_PER_PROMPT = 20

/**
 * The persisted state of an agent.
 * Used for saving and loading agent state.
 */
export interface PersistedAgentState {
	chatHistory?: ChatHistoryItem[]
	chatOrigin?: { x: number; y: number }
	todoList?: TodoItem[]
	contextItems?: ContextItem[]
	modelName?: AgentModelName
	debugFlags?: AgentDebugFlags
	/** The agent's Team Mode role. Persisted so the team is stable across reloads. */
	role?: AgentRole
	/** The agent's whimsical Bee name. Persisted so names are stable across reloads. */
	beeName?: string
	/** The agent's Bee sprite colour. Persisted so looks are stable across reloads. */
	beeColor?: string
}

export interface TldrawAgentOptions {
	/** The editor to associate the agent with. */
	editor: Editor
	/** A key used to differentiate the agent from other agents. */
	id: string
	/** A callback for when an error occurs. */
	onError: (e: unknown) => void
	/** The agent's Team Mode role. Defaults to `solo`. */
	role?: AgentRole
	/** The agent's whimsical Bee name. Generated if not provided. */
	beeName?: string
	/** The agent's Bee sprite colour. Defaults to the pre-Team-Mode colour. */
	beeColor?: string
}

/**
 * An agent that can be prompted to edit the canvas.
 * Access the agent via `useAgent()` hook from TldrawAgentAppProvider,
 * or via `AgentAppAgentsManager.getAgent(editor)`.
 *
 * @example
 * ```tsx
 * const agent = useAgent()
 * agent.prompt('Draw a snowman')
 * ```
 */
export class TldrawAgent {
	/** The editor associated with this agent. */
	editor: Editor

	/** An id to differentiate the agent from other agents. */
	id: string

	/**
	 * The agent's Team Mode role. A stable property distinct from the agent's
	 * (ephemeral) mode and its cosmetic Bee name.
	 */
	role: AgentRole

	/** The agent's whimsical Bee name, stable for the agent's lifetime. */
	beeName: string

	/** The agent's Bee sprite colour. */
	beeColor: string

	/** A callback for when an error occurs. */
	onError: (e: unknown) => void

	// ==================== Managers ====================

	/** The action manager associated with this agent. */
	actions: AgentActionManager

	/** The chat manager associated with this agent. */
	chat: AgentChatManager

	/** The chat origin manager associated with this agent. */
	chatOrigin: AgentChatOriginManager

	/** The context manager associated with this agent. */
	context: AgentContextManager

	/** The debug manager associated with this agent. */
	debug: AgentDebugManager

	/** The lint manager associated with this agent. */
	lints: AgentLintManager

	/** The mode manager associated with this agent. */
	mode: AgentModeManager

	/** The model name manager associated with this agent. */
	modelName: AgentModelNameManager

	/** The request manager associated with this agent. */
	requests: AgentRequestManager

	/** The todo manager associated with this agent. */
	todos: AgentTodoManager

	/** The user action tracker associated with this agent. */
	userAction: AgentUserActionTracker

	// ==================== Prompt Part Utils ====================

	/**
	 * A record of the agent's prompt part util instances.
	 * Used by the `getPromptPartUtil` method.
	 */
	promptPartUtils: Record<PromptPart['type'], PromptPartUtil<PromptPart>>

	/**
	 * Get a prompt part util for a specific part type.
	 *
	 * @param type - The type of part to get the util for.
	 * @returns The part util.
	 */
	getPromptPartUtil(type: PromptPart['type']) {
		return this.promptPartUtils[type]
	}

	/**
	 * Create a new tldraw agent.
	 */
	constructor({ editor, id, onError, role, beeName, beeColor }: TldrawAgentOptions) {
		this.editor = editor
		this.id = id
		this.onError = onError
		this.role = role ?? 'solo'
		this.beeName = beeName ?? generateFairyName()
		this.beeColor = beeColor ?? DEFAULT_BEE_COLOR

		// Initialize managers
		// Note: mode must be initialized before actions, since actions depends on mode
		this.mode = new AgentModeManager(this)
		this.actions = new AgentActionManager(this)
		this.chat = new AgentChatManager(this)
		this.chatOrigin = new AgentChatOriginManager(this)
		this.context = new AgentContextManager(this)
		this.debug = new AgentDebugManager(this)
		this.lints = new AgentLintManager(this)
		this.modelName = new AgentModelNameManager(this)
		this.requests = new AgentRequestManager(this)
		this.todos = new AgentTodoManager(this)
		this.userAction = new AgentUserActionTracker(this)

		// Note: Agent registration is handled by AgentAppAgentsManager.createAgent()

		// Initialize prompt part utils
		this.promptPartUtils = getPromptPartUtilsRecord(this)

		// Start recording user actions
		this.userAction.startRecording()
	}

	// ==================== State Persistence ====================

	/**
	 * Serialize the agent's state to a plain object for persistence.
	 * This is called by the app-level persistence manager to save agent state.
	 */
	serializeState(): PersistedAgentState {
		return {
			// Capped so a long-running session's persisted payload (each item can
			// carry a full RecordsDiff) doesn't grow unboundedly toward the
			// localStorage quota. The model-facing chat history part applies the
			// same cap for the same reason.
			chatHistory: capChatHistory(this.chat.getHistory()),
			chatOrigin: this.chatOrigin.getOrigin(),
			todoList: this.todos.getTodos(),
			contextItems: this.context.getItems(),
			modelName: this.modelName.getModelName(),
			debugFlags: this.debug.getDebugFlags(),
			role: this.role,
			beeName: this.beeName,
			beeColor: this.beeColor,
		}
	}

	/**
	 * Load previously persisted state into the agent.
	 * This is called by the app-level persistence manager to restore agent state.
	 *
	 * @param state - The persisted state to load.
	 */
	loadState(state: PersistedAgentState) {
		if (state.chatHistory) {
			this.chat.setHistory(state.chatHistory)
		}
		if (state.chatOrigin) {
			this.chatOrigin.setOrigin(state.chatOrigin)
		}
		if (state.todoList) {
			this.todos.setTodos(state.todoList)
		}
		if (state.contextItems) {
			this.context.setItems(state.contextItems)
		}
		if (state.modelName) {
			this.modelName.setModelName(state.modelName)
		}
		if (state.debugFlags) {
			this.debug.setDebugFlags(state.debugFlags)
		}
		if (state.role) {
			this.role = state.role
		}
		if (state.beeName) {
			this.beeName = state.beeName
		}
		if (state.beeColor) {
			this.beeColor = state.beeColor
		}
	}

	/**
	 * Dispose of the agent by cancelling requests and stopping listeners.
	 */
	dispose() {
		this.cancel()
		this.userAction.dispose()

		// Dispose all managers
		this.actions.dispose()
		this.chat.dispose()
		this.chatOrigin.dispose()
		this.context.dispose()
		this.debug.dispose()
		this.lints.dispose()
		this.mode.dispose()
		this.modelName.dispose()
		this.requests.dispose()
		this.todos.dispose()

		// Note: Agent removal from registry is handled by AgentAppAgentsManager.deleteAgent()
	}

	/**
	 * Whether the agent is currently acting on the editor or not.
	 * This flag is used to prevent agent actions from being recorded as user actions.
	 *
	 * Do not use this to check if the agent is currently working on a request. Use `isGenerating` instead.
	 */
	private isActingOnEditor = false

	/**
	 * How many times this agent has been told, within the current dispatch, that
	 * a shape action was dropped for an unresolved shapeId. Capped at 1: the
	 * corrective follow-up fires at most once per dispatch, so a shape that
	 * simply cannot be resolved can never drive an endless retry loop. Reset to
	 * 0 whenever a fresh, externally-sourced request arrives (see `prompt`).
	 */
	shapeIdRetryCount = 0

	/**
	 * Get whether the agent is currently acting on the editor.
	 * @returns true if the agent is currently acting, false otherwise.
	 */
	getIsActingOnEditor(): boolean {
		return this.isActingOnEditor
	}

	/**
	 * Set whether the agent is currently acting on the editor.
	 * @param value - true if the agent is acting, false otherwise.
	 */
	setIsActingOnEditor(value: boolean): void {
		this.isActingOnEditor = value
	}

	// ==================== Request Handling ====================

	/**
	 * Get a full prompt based on a request.
	 *
	 * @param request - The request to use for the prompt.
	 * @param helpers - The helpers to use.
	 * @returns The fully assembled prompt.
	 */
	async preparePrompt(request: AgentRequest, helpers: AgentHelpers): Promise<AgentPrompt> {
		const { promptPartUtils } = this
		const transformedParts: PromptPart[] = []

		// Get available prompt part types from the current mode
		const modeDefinition = this.mode.getCurrentModeDefinition()
		if (!modeDefinition.active) {
			throw new Error(
				`Bee is not in an active mode so can't act right now. Current mode: ${modeDefinition.type}`
			)
		}

		const availablePromptPartTypes = modeDefinition.parts

		for (const promptPartType of availablePromptPartTypes) {
			const util = promptPartUtils[promptPartType]
			if (!util) throw new Error(`Prompt part util not found for part type: ${promptPartType}`)
			const part = await util.getPart(structuredClone(request), helpers)
			if (!part) continue
			transformedParts.push(part)
		}

		return Object.fromEntries(transformedParts.map((part) => [part.type, part])) as AgentPrompt
	}

	/**
	 * Prompt the agent to edit the canvas.
	 *
	 * @example
	 * ```tsx
	 * const agent = useAgent()
	 * agent.prompt('Draw a cat')
	 * ```
	 *
	 * ```tsx
	 * agent.prompt({
	 *   message: 'Draw a cat in this area',
	 *   bounds: {
	 *     x: 0,
	 *     y: 0,
	 *     w: 300,
	 *     h: 400,
	 *   },
	 * })
	 * ```
	 *
	 * @returns A promise for when the agent has finished its work.
	 */
	async prompt(input: AgentInput, { nested = false }: { nested?: boolean } = {}) {
		if (this.requests.isGenerating() && !nested) {
			throw new Error('Agent is already prompting. Please wait for the current prompt to finish.')
		}

		if (this.isActingOnEditor) {
			throw new Error(
				"Agent is already acting. It's illegal to prompt an agent during an action. Please use schedule instead."
			)
		}

		this.requests.setIsPrompting(true)

		// Everything below can throw (mode-start hook, the post-completion mode
		// transition loop, the inactive-mode guard, or the recursive continuation
		// call). The finally block guarantees isPrompting/cancelFn are cleared on
		// every exit path, so a thrown error can't leave the agent stuck
		// "generating" forever.
		try {
			const request = this.requests.getFullRequestFromInput(input)

			// A fresh, externally-sourced request (a user prompt or a dispatch from
			// the planner/coordinator) starts a new dispatch, so clear the
			// shape-id retry budget. Self-sourced continuations within the same
			// dispatch keep the existing count, so the corrective follow-up cannot
			// re-arm itself and loop.
			if (request.source !== 'self') {
				this.shapeIdRetryCount = 0
			}

			const startingNode = this.mode.getCurrentModeNode()
			startingNode.onPromptStart?.(this, request)

			// Submit the request to the agent.
			try {
				await this.request(request)
			} catch (e) {
				if (e === 'Cancelled by user' || (e instanceof Error && e.name === 'AbortError')) {
					return
				}
				console.error('Error data:', e)
				this.onError(e)
				return
			}

			let modeChanged = true
			let transitionCount = 0
			while (!this.requests.getScheduledRequest() && modeChanged) {
				if (++transitionCount > MAX_MODE_TRANSITIONS_PER_PROMPT) {
					throw new Error(
						`Agent mode-transition loop exceeded ${MAX_MODE_TRANSITIONS_PER_PROMPT} iterations. Modes may be transitioning into each other.`
					)
				}
				modeChanged = false
				const currentModeType = this.mode.getCurrentModeType()
				const currentModeNode = this.mode.getCurrentModeNode()
				currentModeNode.onPromptEnd?.(this, request) // in case onPromptEnd switches modes
				const newModeType = this.mode.getCurrentModeType()
				if (newModeType !== currentModeType) {
					modeChanged = true
				}
			}

			// If there's still no scheduled request, quit
			const scheduledRequest = this.requests.getScheduledRequest()
			const eventualModeType = this.mode.getCurrentModeType()
			const eventualModeDefinition = this.mode.getCurrentModeDefinition()
			if (!scheduledRequest) {
				if (eventualModeDefinition.active) {
					throw new Error(
						`Agent is not allowed to become inactive during the active mode: ${eventualModeType}`
					)
				}
				return
			}

			// If there *is* a scheduled request, take ownership of it before
			// awaiting its data. A concurrent schedule() call (e.g. from another
			// agent's self-scheduled action) reads getScheduledRequest() and merges
			// into whatever it finds there; clearing first means that merge target
			// is already gone, so a concurrent call creates a fresh scheduled
			// request instead of merging into (and then having wiped by
			// clearScheduledRequest) the one we're about to process.
			this.requests.clearScheduledRequest()

			// Add the scheduled request to chat history
			const resolvedData = await Promise.all(scheduledRequest.data)
			this.chat.push({
				type: 'continuation',
				data: resolvedData,
			})

			await this.prompt(scheduledRequest, { nested: true })
		} finally {
			this.requests.setIsPrompting(false)
			this.requests.setCancelFn(null)
		}
	}

	/**
	 * Send a single request to the agent and handle its response.
	 *
	 * Note: This method does not chain multiple requests together. For a full
	 * agentic system, use the `prompt` method.
	 *
	 * Most developers will not want to use this method directly. It's mostly
	 * used internally by the `prompt` method, but can also be useful for
	 * carrying out evals.
	 *
	 * @param input - The input to form the request from.
	 * @returns A promise for when the request is complete and a cancel function
	 * to abort the request.
	 */
	async request(input: AgentInput) {
		const request = this.requests.getFullRequestFromInput(input)

		// Interrupt any currently active request
		if (this.requests.getActiveRequest() !== null) {
			this.cancel()
		}
		this.requests.setActiveRequest(request)

		try {
			// Call an external helper function to request the agent
			const { promise, cancel } = this.requestAgentActions(request)

			this.requests.setCancelFn(cancel)

			const results = await promise
			this.requests.clearActiveRequest()

			return results
		} catch (e) {
			this.requests.clearActiveRequest()
			throw e
		}
	}

	/**
	 * Schedule further work for the agent to do after this request has finished.
	 * What you schedule will get merged with the currently scheduled request, if there is one.
	 *
	 * @example
	 * ```tsx
	 * // Add an instruction
	 * agent.schedule('Add more detail.')
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Move the viewport
	 * agent.schedule({
	 *  bounds: { x: 0, y: 0, w: 100, h: 100 },
	 * })
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Add data to the request
	 * agent.schedule({ data: [value] })
	 * ```
	 */
	schedule(input: AgentInput) {
		const scheduledRequest = this.requests.getScheduledRequest()

		// If there's no request scheduled yet, schedule one
		if (!scheduledRequest) {
			this._schedule(input)
			return
		}

		const newRequest = this.requests.getPartialRequestFromInput(input)

		this._schedule({
			// Append to properties where possible
			agentMessages: [...scheduledRequest.agentMessages, ...(newRequest.agentMessages ?? [])],
			userMessages: [...scheduledRequest.userMessages, ...(newRequest.userMessages ?? [])],
			data: [...scheduledRequest.data, ...(newRequest.data ?? [])],

			// Override specific properties
			bounds: newRequest.bounds ?? scheduledRequest.bounds,
			contextItems: [...scheduledRequest.contextItems, ...(newRequest.contextItems ?? [])],
			source: newRequest.source ?? scheduledRequest.source ?? 'self',
		})
	}

	/**
	 * Manually override what the agent should do next.
	 *
	 * @example
	 * ```tsx
	 * agent.setScheduledRequest('Add more detail.')
	 * ```
	 *
	 * @example
	 * ```tsx
	 * agent.setScheduledRequest({
	 *  message: 'Add more detail to this area.',
	 *  bounds: { x: 0, y: 0, w: 100, h: 100 },
	 * })
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Cancel the scheduled request
	 * agent.setScheduledRequest(null)
	 * ```
	 *
	 * @param input - What to set the scheduled request to, or null to cancel
	 * the scheduled request.
	 */
	private _schedule(input: AgentInput | null) {
		if (input === null) {
			this.requests.clearScheduledRequest()
			return
		}

		const partialRequest = this.requests.getPartialRequestFromInput(input)
		partialRequest.source = partialRequest.source ?? 'self' // when scheduling, we want the default source to be 'self' if none is provided
		const request = this.requests.getFullRequestFromInput(partialRequest)

		const isCurrentlyActive = this.requests.isGenerating()

		if (isCurrentlyActive) {
			this.requests.setScheduledRequest(request)
		} else {
			this.prompt(request).catch((e) => {
				console.error(`[Agent:${this.id}] Scheduled prompt failed:`, e)
			})
		}
	}

	/**
	 * Interrupt the agent and set their mode.
	 * Optionally, schedule a request.
	 */
	interrupt({ input, mode }: { input: AgentInput | null; mode?: AgentModeType }) {
		this.requests.cancel()
		if (mode) {
			this.mode.setMode(mode)
		}
		if (input !== null) {
			this.schedule(input)
		}
	}

	// ==================== Cancel & Reset ====================

	/**
	 * Cancel the agent's current prompt, if one is active.
	 */
	cancel() {
		const activeRequest = this.requests.getActiveRequest()

		if (activeRequest) {
			const modeType = this.mode.getCurrentModeType()
			const modeNode = getModeNode(modeType)
			modeNode.onPromptCancel?.(this, activeRequest)

			const newModeDefinition = this.mode.getCurrentModeDefinition()
			if (newModeDefinition.active) {
				throw new Error(
					`Agent is not allowed to become inactive during the active mode: ${this.mode.getCurrentModeType()}`
				)
			}
		}

		this.requests.cancel()
	}

	/**
	 * Reset the agent's chat and memory.
	 * Cancel the current request if there's one active.
	 */
	reset() {
		this.cancel()

		// Reset all managers
		this.actions.reset()
		this.chat.reset()
		this.chatOrigin.reset()
		this.context.reset()
		this.lints.reset()
		this.mode.reset()
		this.requests.reset()
		this.todos.reset()
		this.userAction.reset()
	}

	// ==================== Request Helpers ====================

	/**
	 * Send a request to the agent and handle its response.
	 *
	 * This is a helper function that is used internally by the agent.
	 */
	private requestAgentActions(request: AgentRequest) {
		const { editor } = this

		// Add user prompt to chat history
		const promptHistoryItem: ChatHistoryPromptItem = {
			type: 'prompt',
			promptSource: request.source,
			agentFacingMessage: request.agentMessages.join('\n'),
			userFacingMessage: request.userMessages.length > 0 ? request.userMessages.join('\n') : null,
			contextItems: structuredClone(request.contextItems),
			selectedShapes: this.editor
				.getSelectedShapes()
				.map((shape) => convertTldrawShapeToFocusedShape(this.editor, structuredClone(shape))),
		}
		this.chat.push(promptHistoryItem)

		let cancelled = false
		const controller = new AbortController()
		const signal = controller.signal
		const helpers = new AgentHelpers(this)

		const modeDefinition = this.mode.getCurrentModeDefinition()
		if (!modeDefinition.active) {
			this.cancel()
			throw new Error(
				`Agent is not in an active mode so cannot take actions. Current mode: ${modeDefinition.type}`
			)
		}

		// Widen from the per-mode const-literal tuple to the full action-type
		// union. Since Team Mode added multiple active modes with different action
		// sets, the inferred type is a union of tuples, which would narrow
		// `.includes`'s parameter to the intersection of their element types.
		const availableActions: readonly AgentAction['_type'][] = modeDefinition.actions

		const requestPromise = (async () => {
			const prompt = await this.preparePrompt(request, helpers)
			let incompleteDiff: RecordsDiff<TLRecord> | null = null
			const actionPromises: Promise<void>[] = []
			let lastShapeBoundsForResting: { x: number; y: number; w: number; h: number } | null = null
			// Complete actions dropped by sanitizeAction (an unresolvable shapeId).
			// Collected so we can tell the model once, after the turn, that the
			// edit did not land, instead of it silently vanishing.
			const droppedShapeActions: Streaming<AgentAction>[] = []
			try {
				for await (const action of this.streamAgentActions({ prompt, signal })) {
					if (cancelled) break

					// Set acting flag BEFORE editor.run so user action tracker ignores all changes
					// including diff reverts that happen before act() is called
					this.setIsActingOnEditor(true)
					try {
						editor.run(
							() => {
								const actionUtilType = this.actions.getAgentActionUtilType(action._type)
								const actionUtil = this.actions.getAgentActionUtil(action._type)

								// If the action is not in the mode's available actions, skip it
								if (!availableActions.includes(actionUtilType)) {
									return
								}

								// If there was a diff from an incomplete action, revert it so that we can reapply the action
								// This must happen BEFORE sanitize so we're working with clean state
								if (incompleteDiff) {
									const inversePrevDiff = reverseRecordsDiff(incompleteDiff)
									editor.store.applyDiff(inversePrevDiff)
									// Track the inverse diff to update created shapes tracking
									this.lints.trackShapesFromDiff(inversePrevDiff)
									incompleteDiff = null
								}

								// Sanitize the agent's action
								const transformedAction = actionUtil.sanitizeAction(action, helpers)
								if (!transformedAction) {
									// A complete action whose shapeId could not be resolved is
									// recorded so the model can be told once after the turn.
									if (action.complete && actionTargetsShape(action)) {
										droppedShapeActions.push(action)
									}
									return
								}

								// Apply the action to the app and editor.
								// tldraw geometry errors (e.g. Polyline2d with < 2 points) can throw
								// during reactive cache recomputation inside createShape — skip and continue.
								let actResult: ReturnType<typeof this.actions.act> | null = null
								try {
									actResult = this.actions.act(transformedAction, helpers)
								} catch (error) {
									console.warn('Skipping action; act() threw:', error)
									incompleteDiff = null
									return
								}
								const { diff, promise } = actResult

								const beePosition =
									extractBeePositionFromDiff(
										diff,
										(shapeId) => {
											try {
												const bounds = editor.getShapePageBounds(shapeId as TLShapeId)
												if (bounds) lastShapeBoundsForResting = bounds
												return bounds
											} catch {
												return null
											}
										},
										{ placement: 'center', zoomLevel: editor.getZoomLevel() }
									) ??
									extractBeePosition(transformedAction, (position) =>
										helpers.removeOffsetFromVec(position)
									)
								if (beePosition) {
									this.requests.setBeePosition(beePosition)
								}

								if (promise) {
									actionPromises.push(promise)
								}

								// Track shapes from diff for both complete and incomplete actions
								this.lints.trackShapesFromDiff(diff)

								// If the action is incomplete, save the diff so that we can revert it in the future
								if (transformedAction.complete) {
									// Log completed action if debug logging is enabled
									this.debug.logCompletedAction(transformedAction)
								} else {
									incompleteDiff = diff
								}
							},
							{
								ignoreShapeLock: true,
								history: 'ignore',
							}
						)
					} finally {
						this.setIsActingOnEditor(false)
					}
				}
				await Promise.all(actionPromises)
				if (!cancelled && lastShapeBoundsForResting) {
					const restingPos = getBeePositionFromBounds(lastShapeBoundsForResting, 'resting', editor.getZoomLevel())
					this.requests.setBeePosition(restingPos)
				}

				// Shape edits were dropped for unresolved ids. Tell the model once
				// per dispatch (naming the dropped actions and listing the real
				// shape ids it can target), then let it retry. The hard cap of 1,
				// reset only on a fresh external dispatch, is what stops this from
				// looping the way the earlier unbounded version did.
				if (
					!cancelled &&
					droppedShapeActions.length > 0 &&
					this.shapeIdRetryCount < 1 &&
					!this.requests.getScheduledRequest()
				) {
					const dropped = droppedShapeActions.map((a) => describeDroppedShapeAction(a)).join('\n')
					const realIds = editor
						.getCurrentPageShapes()
						.map((shape) => convertTldrawIdToSimpleId(shape.id))
						.join(', ')
					this.shapeIdRetryCount = 1
					this.schedule({
						agentMessages: [
							`Some of your edits were skipped because their shape IDs do not exist on the canvas, even if you described them as done:\n${dropped}\nThe real shape IDs currently on the canvas are: ${realIds}\nReissue those edits using IDs from that list. If a shape you wanted is not listed, it is not there to edit.`,
						],
						source: 'self',
					})
				}
			} catch (e) {
				if (e === 'Cancelled by user' || (e instanceof Error && e.name === 'AbortError')) {
					return
				}
				this.onError(e)
			}
		})()

		const cancel = () => {
			cancelled = true
			controller.abort('Cancelled by user')
		}

		return { promise: requestPromise, cancel }
	}

	/**
	 * Stream a response from the model.
	 * Act on the model's events as they come in.
	 *
	 * This is a helper function that is used internally by the agent.
	 */
	private async *streamAgentActions({
		prompt,
		signal,
	}: {
		prompt: BaseAgentPrompt
		signal: AbortSignal
	}): AsyncGenerator<Streaming<AgentAction>> {
		const res = await fetch('/stream', {
			method: 'POST',
			body: JSON.stringify(prompt),
			headers: {
				'Content-Type': 'application/json',
			},
			signal,
		})

		if (!res.body) {
			throw Error('No body in response')
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''

		try {
			while (true) {
				const { value, done } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const actions = buffer.split('\n\n')
				buffer = actions.pop() || ''

				for (const action of actions) {
					const match = action.match(/^data: (.+)$/m)
					if (!match) continue

					let data: any
					try {
						data = JSON.parse(match[1])
					} catch (err: any) {
						// A single malformed chunk (e.g. split mid-line by a network
						// hiccup) shouldn't take down the whole stream — skip it and
						// keep consuming subsequent, well-formed chunks.
						console.warn('Skipping malformed SSE chunk:', err, action)
						continue
					}

					// The server explicitly reported a failure (not a parse issue on
					// our end) — this is fatal to the stream, so propagate it as-is
					// to preserve its message and stack.
					if (data && typeof data === 'object' && 'error' in data) {
						throw new Error(data.error)
					}

					const agentAction: Streaming<AgentAction> = data
					yield agentAction
				}
			}
		} finally {
			reader.releaseLock()
		}
	}
}

/** Whether an action targets an existing shape by id (so a miss is worth reporting). */
function actionTargetsShape(action: Streaming<AgentAction>): boolean {
	const anyAction = action as { shapeId?: unknown; shapeIds?: unknown }
	return typeof anyAction.shapeId === 'string' || Array.isArray(anyAction.shapeIds)
}

/** One line naming a dropped action and the shape id(s) it failed to resolve. */
function describeDroppedShapeAction(action: Streaming<AgentAction>): string {
	const anyAction = action as { _type: string; shapeId?: string; shapeIds?: string[] }
	const ids = anyAction.shapeId
		? [anyAction.shapeId]
		: Array.isArray(anyAction.shapeIds)
			? anyAction.shapeIds
			: []
	const idText = ids.length > 0 ? ids.join(', ') : '(no shape id)'
	return `- ${anyAction._type} targeting ${idText}`
}

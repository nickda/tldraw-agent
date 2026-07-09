import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error } from 'itty-router'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { Environment } from '../environment'
import { AgentService } from './AgentService'
import { createSSEStreamResponse } from './createSSEStreamResponse'

export class AgentDurableObject extends DurableObject<Environment> {
	service: AgentService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new AgentService(this.env) // swap this with your own service
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			return error(e)
		},
	}).post('/stream', (request) => this.stream(request))

	// `fetch` is the entry point for all requests to the Durable Object
	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	/**
	 * Stream changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the streamed changes.
	 */
	private async stream(request: Request): Promise<Response> {
		const prompt = (await request.json()) as AgentPrompt
		return createSSEStreamResponse((signal) => this.service.stream(prompt, signal))
	}
}

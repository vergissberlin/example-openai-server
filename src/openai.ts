import OpenAI from 'openai'
import { config } from './config.js'

/**
 * The upstream client.
 *
 * Constructed on first use rather than at import time, which is what lets a
 * test install a stub before anything reaches the network.
 *
 * There is deliberately no "missing key" branch: config.ts refuses to parse an
 * environment without one, so the process never gets this far misconfigured.
 * Failing at startup rather than per request is the point — a container that
 * boots, passes its own health check and then answers every request with a 503
 * looks like a successful deploy to an orchestrator, which will happily retire
 * the working version it replaced.
 */
let client: OpenAI | null = null

export function getClient(): OpenAI {
	// An already-constructed client wins, which is what makes the test seam
	// below work.
	if (client) return client

	client = new OpenAI({
		apiKey: config.openAiKey,
		...(config.openAiOrg ? { organization: config.openAiOrg } : {})
	})

	return client
}

/** Test seam: lets a suite inject a stub without reaching the network. */
export function setClient(stub: OpenAI | null): void {
	client = stub
}

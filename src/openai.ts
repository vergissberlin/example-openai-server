import OpenAI from 'openai'
import { config } from './config.js'
import { ApiError } from './errors.js'

/**
 * The upstream client.
 *
 * Created lazily so the app can boot — and answer `/healthz` — without a key
 * configured. Requests that need one then fail individually with a clear
 * message instead of the whole process refusing to start.
 */
let client: OpenAI | null = null

export function getClient(): OpenAI {
	// An already-constructed client wins, which is what makes the test seam
	// below work without a key in the environment.
	if (client) return client

	if (!config.openAiKey) {
		throw new ApiError(
			'The server has no upstream API key configured.',
			503,
			'configuration_error'
		)
	}

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

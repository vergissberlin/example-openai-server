import { setClient } from '../openai.js'
import type OpenAI from 'openai'
import type { Response as SuperagentResponse } from 'superagent'

/**
 * Installs a stub upstream.
 *
 * Every test drives the app through this rather than the network: a suite that
 * called OpenAI for real would be slow, flaky and would spend money on each
 * run.
 */
export function stubUpstream(overrides: {
	chatCreate?: (...args: unknown[]) => unknown
	modelsList?: () => unknown
	imagesGenerate?: (...args: unknown[]) => unknown
}) {
	const stub = {
		chat: {
			completions: {
				create: overrides.chatCreate ?? (() => Promise.resolve(completionFixture()))
			}
		},
		models: {
			list: overrides.modelsList ?? (() => Promise.resolve({ data: [] }))
		},
		images: {
			generate: overrides.imagesGenerate ?? (() => Promise.resolve({ data: [] }))
		}
	}

	setClient(stub as unknown as OpenAI)
	return stub
}

export function completionFixture(content = 'stubbed answer') {
	return {
		id: 'chatcmpl-test',
		object: 'chat.completion',
		created: 0,
		model: 'gpt-4o-mini',
		choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]
	}
}

/** Builds an async iterable that looks like the SDK's streaming response. */
export function streamFixture(pieces: string[], options: { onIterate?: () => void } = {}) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const piece of pieces) {
				options.onIterate?.()
				yield {
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'gpt-4o-mini',
					choices: [{ index: 0, delta: { content: piece }, finish_reason: null }]
				}
			}
		}
	}
}

/** An error shaped the way the SDK reports upstream failures. */
export function upstreamError(status: number, message = 'upstream detail') {
	return Object.assign(new Error(message), { status })
}

/**
 * Collects an SSE response body as text.
 *
 * Superagent picks a parser by content type and has none for
 * `text/event-stream`, so without this the body arrives empty and every
 * streaming assertion passes vacuously or fails for the wrong reason.
 */
export function sseParser(
	res: SuperagentResponse,
	callback: (error: Error | null, body: string) => void
) {
	// Superagent types the parser argument as its own Response, but hands the
	// raw IncomingMessage to it at runtime.
	const stream = res as unknown as NodeJS.ReadableStream & {
		setEncoding(encoding: string): void
	}

	let body = ''
	stream.setEncoding('utf8')
	stream.on('data', (chunk: string) => {
		body += chunk
	})
	stream.on('end', () => callback(null, body))
}

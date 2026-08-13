import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { setClient } from '../openai.js'
import {
	completionFixture,
	sseParser,
	streamFixture,
	stubUpstream,
	upstreamError
} from './helpers.js'

const app = createApp()

beforeEach(() => {
	stubUpstream({})
})

afterEach(() => {
	setClient(null)
	vi.restoreAllMocks()
})

describe('POST /v1/chat/completions', () => {
	it('returns a completion for a valid request', async () => {
		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] })

		expect(response.status).toBe(200)
		expect(response.body.choices[0].message.content).toBe('stubbed answer')
	})

	it('rejects a request without messages', async () => {
		const response = await request(app).post('/v1/chat/completions').send({})

		expect(response.status).toBe(400)
		expect(response.body.error.type).toBe('invalid_request_error')
	})

	it('rejects a model that is not on the allowlist', async () => {
		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ model: 'gpt-4-turbo', messages: [{ role: 'user', content: 'hi' }] })

		expect(response.status).toBe(400)
		expect(response.body.error.message).toContain('not available')
	})

	it('falls back to the default model when none is given', async () => {
		const seen: Array<Record<string, unknown>> = []
		stubUpstream({
			chatCreate: (body) => {
				seen.push(body as Record<string, unknown>)
				return Promise.resolve(completionFixture())
			}
		})

		await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }] })

		expect(seen[0]?.model).toBe('gpt-4o-mini')
	})

	it('clamps max_tokens to the server ceiling instead of trusting the caller', async () => {
		const seen: Array<Record<string, unknown>> = []
		stubUpstream({
			chatCreate: (body) => {
				seen.push(body as Record<string, unknown>)
				return Promise.resolve(completionFixture())
			}
		})

		await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 999_999 })

		expect(seen[0]?.max_tokens).toBe(2048)
	})

	it('rejects sampling parameters outside their valid range', async () => {
		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }], temperature: 9 })

		expect(response.status).toBe(400)
	})
})

describe('streaming', () => {
	it('emits SSE frames and terminates with [DONE]', async () => {
		stubUpstream({ chatCreate: () => Promise.resolve(streamFixture(['Hel', 'lo'])) })

		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }], stream: true })
			.buffer(true)
			.parse(sseParser)

		expect(response.status).toBe(200)
		expect(response.headers['content-type']).toContain('text/event-stream')
		// Without this a reverse proxy can buffer the whole stream, which
		// silently turns streaming back into one slow response.
		expect(response.headers['x-accel-buffering']).toBe('no')

		const frames = (response.body as string).split('\n\n').filter(Boolean)
		expect(frames.at(-1)).toBe('data: [DONE]')

		const deltas = frames
			.filter((frame) => frame.startsWith('data: {'))
			.map((frame) => JSON.parse(frame.slice(6)).choices[0].delta.content)
		expect(deltas.join('')).toBe('Hello')
	})

	it('reports a mid-stream failure in-band, because the status is already sent', async () => {
		stubUpstream({
			chatCreate: () =>
				Promise.resolve({
					async *[Symbol.asyncIterator]() {
						yield {
							choices: [{ index: 0, delta: { content: 'partial' } }]
						}
						throw upstreamError(500)
					}
				})
		})

		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }], stream: true })
			.buffer(true)
			.parse(sseParser)

		// The response still began with 200 — it had to.
		expect(response.status).toBe(200)
		expect(response.body as string).toContain('partial')
		expect(response.body as string).toContain('event: error')
		expect(response.body as string).not.toContain('[DONE]')
	})

	it('passes an abort signal to the upstream so a stopped generation is not billed', async () => {
		let receivedSignal: AbortSignal | undefined
		stubUpstream({
			chatCreate: (_body, options) => {
				receivedSignal = (options as { signal?: AbortSignal } | undefined)?.signal
				return Promise.resolve(streamFixture(['x']))
			}
		})

		await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }], stream: true })

		expect(receivedSignal).toBeInstanceOf(AbortSignal)
	})
})

describe('upstream failures', () => {
	it('never leaks upstream credentials problems to the caller', async () => {
		stubUpstream({
			chatCreate: () => Promise.reject(upstreamError(401, 'Incorrect API key sk-abc'))
		})

		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }] })

		expect(response.status).toBe(502)
		expect(JSON.stringify(response.body)).not.toContain('sk-abc')
		expect(JSON.stringify(response.body)).not.toContain('Incorrect API key')
	})

	it('passes a rate limit through as a rate limit', async () => {
		stubUpstream({ chatCreate: () => Promise.reject(upstreamError(429)) })

		const response = await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'hi' }] })

		expect(response.status).toBe(429)
		expect(response.body.error.type).toBe('rate_limit_error')
	})

	// A missing key used to be reported per request, with a 503. It is now
	// rejected at startup instead — see config.spec.ts. A process that runs
	// without one cannot exist, so there is nothing to assert here.
})

describe('GET /v1/models', () => {
	it('advertises only the allowlisted models', async () => {
		stubUpstream({
			modelsList: () =>
				Promise.resolve({
					data: [
						{ id: 'gpt-4o-mini', created: 1, owned_by: 'openai' },
						{ id: 'gpt-4o', created: 2, owned_by: 'openai' },
						{ id: 'o1-preview', created: 3, owned_by: 'openai' }
					]
				})
		})

		const response = await request(app).get('/v1/models')

		expect(response.status).toBe(200)
		expect(response.body.data.map((model: { id: string }) => model.id)).toEqual([
			'gpt-4o-mini',
			'gpt-4o'
		])
	})
})

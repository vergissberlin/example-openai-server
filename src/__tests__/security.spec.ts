import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { config } from '../config.js'
import { setClient } from '../openai.js'
import { stubUpstream } from './helpers.js'

const app = createApp()

beforeEach(() => {
	stubUpstream({})
})

afterEach(() => {
	setClient(null)
	vi.restoreAllMocks()
})

/*
 * These are the properties that matter for a proxy sitting in front of a paid
 * key. The previous version defaulted CORS to `*`, which made it usable — and
 * billable — from any page on the internet.
 */
describe('CORS', () => {
	it('allows a configured origin', async () => {
		const origin = config.allowedOrigins[0]!
		const response = await request(app).get('/healthz').set('Origin', origin)

		expect(response.status).toBe(200)
		expect(response.headers['access-control-allow-origin']).toBe(origin)
	})

	it('refuses an origin that is not on the allowlist', async () => {
		const response = await request(app)
			.post('/v1/chat/completions')
			.set('Origin', 'https://evil.test')
			.send({ messages: [{ role: 'user', content: 'hi' }] })

		expect(response.status).toBe(403)
		expect(response.headers['access-control-allow-origin']).toBeUndefined()
	})

	it('never answers with a wildcard origin', async () => {
		const response = await request(app).get('/healthz').set('Origin', config.allowedOrigins[0]!)

		expect(response.headers['access-control-allow-origin']).not.toBe('*')
	})

	it('still serves callers that send no origin at all, such as health probes', async () => {
		const response = await request(app).get('/healthz')

		expect(response.status).toBe(200)
	})
})

describe('body limits', () => {
	it('rejects a payload beyond the configured size', async () => {
		const response = await request(app)
			.post('/v1/chat/completions')
			.send({
				messages: [{ role: 'user', content: 'x'.repeat(config.maxBodyBytes + 1024) }]
			})

		expect(response.status).toBe(413)
	})
})

describe('logging', () => {
	it('records metadata but never prompt or completion content', async () => {
		const lines: string[] = []
		vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
			lines.push(String(line))
		})

		await request(app)
			.post('/v1/chat/completions')
			.send({ messages: [{ role: 'user', content: 'a very secret prompt' }] })

		const output = lines.join('\n')
		expect(output).toContain('/v1/chat/completions')
		// The old implementation logged every answer in full.
		expect(output).not.toContain('a very secret prompt')
		expect(output).not.toContain('stubbed answer')
	})
})

describe('unknown routes', () => {
	it('answers 404 in the same error shape as everything else', async () => {
		const response = await request(app).get('/nope')

		expect(response.status).toBe(404)
		expect(response.body.error.type).toBe('not_found_error')
	})
})

describe('GET /healthz', () => {
	it('answers without touching the upstream', async () => {
		setClient(null)

		const response = await request(app).get('/healthz')

		expect(response.status).toBe(200)
		expect(response.body.status).toBe('ok')
		// Reports whether a key exists, never anything about it.
		expect(response.body).not.toHaveProperty('key')
		expect(typeof response.body.configured).toBe('boolean')
	})
})

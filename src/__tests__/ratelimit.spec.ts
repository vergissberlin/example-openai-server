import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { config } from '../config.js'
import { setClient } from '../openai.js'
import { stubUpstream } from './helpers.js'

/*
 * In its own file on purpose. The limiter is created once when `middleware.ts`
 * is imported, so exhausting it here would hand 429s to every later test in
 * the same module registry. Vitest isolates test files, which gives this one a
 * limiter of its own.
 */
const app = createApp()

beforeEach(() => {
	stubUpstream({})
})

afterEach(() => {
	setClient(null)
})

describe('rate limiting', () => {
	it('refuses further requests once the window budget is spent', async () => {
		const limit = config.rateLimitMax

		// Sequential rather than concurrent: the limiter counts per request, and
		// a burst makes the boundary ambiguous.
		for (let i = 0; i < limit; i++) {
			const response = await request(app).get('/v1/models')
			expect(response.status, `request ${i + 1} of ${limit} should still pass`).toBe(200)
		}

		const blocked = await request(app).get('/v1/models')

		expect(blocked.status).toBe(429)
		expect(blocked.body.error.type).toBe('rate_limit_error')
	})

	it('advertises the remaining budget so a client can back off before being cut', async () => {
		const response = await request(app).get('/v1/models')

		// draft-7 headers: a single `RateLimit` field carrying limit and remaining.
		expect(response.headers['ratelimit']).toBeDefined()
		expect(response.headers['x-ratelimit-limit']).toBeUndefined()
	})

	it('never throttles the health probe, which must stay answerable', async () => {
		// The budget is already spent by the first test in this file.
		const response = await request(app).get('/healthz')

		expect(response.status).toBe(200)
	})
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { setClient } from '../openai.js'
import { completionFixture, stubUpstream } from './helpers.js'

const app = createApp()

beforeEach(() => {
	stubUpstream({})
})

afterEach(() => {
	setClient(null)
	vi.restoreAllMocks()
})

/*
 * The deployed client still calls these while it is being updated, so their
 * response shape has to stay byte-compatible — including the leading double
 * newline the old client strips off.
 */
describe('deprecated /text/', () => {
	it('answers in the old shape', async () => {
		stubUpstream({ chatCreate: () => Promise.resolve(completionFixture('An answer.')) })

		const response = await request(app).get('/text/').query({ prompt: 'hello' })

		expect(response.status).toBe(200)
		expect(response.body).toEqual({ text: '\n\nAn answer.' })
	})

	it('keeps the old no-prompt behaviour of a 200 with a message', async () => {
		const response = await request(app).get('/text/')

		expect(response.status).toBe(200)
		expect(response.body).toEqual({ text: 'No prompt provided' })
	})

	it('runs on the current model, not the retired one the old code used', async () => {
		const seen: Array<Record<string, unknown>> = []
		stubUpstream({
			chatCreate: (body) => {
				seen.push(body as Record<string, unknown>)
				return Promise.resolve(completionFixture())
			}
		})

		await request(app).get('/text/').query({ prompt: 'hello' })

		expect(seen[0]?.model).toBe('gpt-4o-mini')
	})
})

describe('deprecated /image/', () => {
	it('answers with the image url in the old shape', async () => {
		stubUpstream({
			imagesGenerate: () => Promise.resolve({ data: [{ url: 'https://img.test/a.png' }] })
		})

		const response = await request(app).get('/image/').query({ prompt: 'a cat' })

		expect(response.body).toEqual({ image: 'https://img.test/a.png' })
	})

	it('reports an empty result the way the old route did', async () => {
		stubUpstream({ imagesGenerate: () => Promise.resolve({ data: [] }) })

		const response = await request(app).get('/image/').query({ prompt: 'a cat' })

		expect(response.body).toEqual({ image: 'No image found' })
	})

	it('does not crash when the upstream fails', async () => {
		// The old implementation sent a response from its catch handler and
		// then carried on to read `response.data`, throwing on undefined.
		stubUpstream({ imagesGenerate: () => Promise.reject(new Error('boom')) })

		const response = await request(app).get('/image/').query({ prompt: 'a cat' })

		expect(response.status).toBe(502)
		expect(response.body.error).toBeDefined()
	})
})

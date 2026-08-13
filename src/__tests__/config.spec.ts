import { describe, it, expect } from 'vitest'

import { parseConfig } from '../config.js'

/** The minimum that must be present for anything to parse at all. */
const valid = { OPENAI_API_KEY: 'sk-test' }

describe('parseConfig', () => {
	it('refuses an environment without any upstream key', () => {
		// Without this the proxy starts, passes its own health check, and answers
		// every real request with a 500.
		expect(() => parseConfig({})).toThrow(/OPENAI_API_KEY/)
	})

	it('accepts the legacy OPENAI_KEY name', () => {
		expect(parseConfig({ OPENAI_KEY: 'sk-legacy' }).openAiKey).toBe('sk-legacy')
	})

	it('prefers OPENAI_API_KEY when both are set', () => {
		expect(parseConfig({ OPENAI_API_KEY: 'sk-new', OPENAI_KEY: 'sk-old' }).openAiKey).toBe('sk-new')
	})

	it('never puts a value into the error message', () => {
		// The offending field may well be the key itself.
		let message = ''
		try {
			parseConfig({ OPENAI_API_KEY: 'sk-secret-value', MAX_TOKENS_LIMIT: 'not-a-number' })
		} catch (error) {
			message = (error as Error).message
		}

		expect(message).toContain('MAX_TOKENS_LIMIT')
		expect(message).not.toContain('sk-secret-value')
		expect(message).not.toContain('not-a-number')
	})

	it('does not fall back to a wildcard origin', () => {
		// A wildcard would let any page on the internet spend the key's budget.
		expect(parseConfig(valid).allowedOrigins).not.toContain('*')
	})

	it('splits comma-separated lists and drops the whitespace', () => {
		const parsed = parseConfig({
			...valid,
			ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com ,'
		})

		expect(parsed.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com'])
	})

	it('rejects a non-numeric limit rather than silently using a default', () => {
		expect(() => parseConfig({ ...valid, RATE_LIMIT_MAX: 'lots' })).toThrow(/RATE_LIMIT_MAX/)
	})
})

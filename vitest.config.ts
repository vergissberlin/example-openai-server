import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// src/config.ts refuses to parse an environment without an upstream key,
		// and every module reaches it on import — so the suite needs one before
		// any test file loads.
		//
		// The value is fake and never reaches the network: each test installs a
		// stub upstream through helpers.stubUpstream. A suite that called OpenAI
		// for real would be slow, flaky, and would spend money per run.
		env: {
			OPENAI_API_KEY: 'sk-test-not-a-real-key'
		}
	}
})

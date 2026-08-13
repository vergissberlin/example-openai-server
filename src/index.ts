import { createApp } from './app.js'
import { config } from './config.js'

const app = createApp()

const server = app.listen(config.port, () => {
	console.log(
		JSON.stringify({
			message: 'OpenAI proxy listening',
			port: config.port,
			env: config.nodeEnv,
			configured: Boolean(config.openAiKey)
		})
	)

	if (!config.openAiKey) {
		console.warn('No OPENAI_API_KEY configured — requests will fail until one is set.')
	}
})

/**
 * Graceful shutdown.
 *
 * Railway sends SIGTERM on redeploy; without this, in-flight streams are cut
 * mid-response instead of being allowed to finish.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
	process.on(signal, () => {
		console.log(JSON.stringify({ message: 'Shutting down', signal }))
		server.close(() => process.exit(0))

		// Do not wait forever for a stalled connection.
		setTimeout(() => process.exit(1), 10_000).unref()
	})
}

import express from 'express'
import { config } from './config.js'
import {
	corsMiddleware,
	errorHandler,
	notFoundHandler,
	rateLimiter,
	requestLogger
} from './middleware.js'
import { chatRouter } from './routes/chat.js'
import { healthRouter } from './routes/health.js'
import { imagesRouter } from './routes/images.js'
import { legacyRouter } from './routes/legacy.js'

/**
 * Builds the express app.
 *
 * Separated from the listener so tests can drive it through supertest without
 * binding a port.
 */
export function createApp() {
	const app = express()

	// Railway terminates TLS upstream; without this the rate limiter buckets
	// every caller under the proxy's own address.
	app.set('trust proxy', 1)

	app.use(requestLogger)
	app.use(corsMiddleware)

	// Health checks stay outside the rate limiter so a probe can never be
	// throttled out of existence.
	app.use(healthRouter)

	app.use(rateLimiter)
	app.use(express.json({ limit: config.maxBodyBytes }))

	app.use(chatRouter)
	app.use(imagesRouter)
	app.use(legacyRouter)

	app.use(notFoundHandler)
	app.use(errorHandler)

	return app
}

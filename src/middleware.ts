import type { ErrorRequestHandler, RequestHandler } from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import { ApiError } from './errors.js'

/**
 * CORS as an allowlist.
 *
 * The previous version defaulted to `*`, which meant any page on the internet
 * could call this proxy and spend the key's budget. Origins now come from
 * ALLOWED_ORIGINS, and anything else is refused.
 */
export const corsMiddleware = cors({
	origin(origin, callback) {
		// Same-origin and non-browser callers (curl, health checks) send no
		// Origin header at all; there is nothing to check against.
		if (!origin) return callback(null, true)

		if (config.allowedOrigins.includes(origin)) return callback(null, true)
		callback(new ApiError('This origin is not allowed.', 403, 'cors_error'))
	},
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	maxAge: 86_400
})

export const rateLimiter = rateLimit({
	windowMs: config.rateLimitWindowMs,
	limit: config.rateLimitMax,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: new ApiError('Too many requests.', 429, 'rate_limit_error').toBody()
})

/**
 * Request logging.
 *
 * Metadata only. Prompts and completions are potentially personal data and are
 * never written to the log — the previous version logged every answer in full.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
	const startedAt = process.hrtime.bigint()

	res.on('finish', () => {
		const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
		console.log(
			JSON.stringify({
				method: req.method,
				path: req.path,
				status: res.statusCode,
				ms: Math.round(ms)
			})
		)
	})

	next()
}

export const notFoundHandler: RequestHandler = (_req, res) => {
	res.status(404).json(new ApiError('Unknown endpoint.', 404, 'not_found_error').toBody())
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
	if (res.headersSent) {
		// Mid-stream failures already reported themselves in-band; handing the
		// response to express now would corrupt the stream.
		return next(error)
	}

	if (error instanceof ApiError) {
		res.status(error.status).json(error.toBody())
		return
	}

	// Body-parser rejects payloads over the configured limit.
	if (typeof error === 'object' && error !== null && 'type' in error) {
		if ((error as { type?: string }).type === 'entity.too.large') {
			res.status(413).json(
				new ApiError(
					'The request body is too large.',
					413,
					'invalid_request_error'
				).toBody()
			)
			return
		}
	}

	console.error('Unhandled error:', error instanceof Error ? error.message : 'unknown')
	res.status(500).json(new ApiError('Internal server error.', 500, 'internal_error').toBody())
}

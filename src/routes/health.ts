import { Router } from 'express'
import { config } from '../config.js'

export const healthRouter = Router()

/**
 * Liveness probe for Railway.
 *
 * Answers without touching the upstream, so a probe never costs a request and
 * never fails because of an upstream outage. `configured` reports whether a
 * key is present without revealing anything about it.
 */
healthRouter.get('/healthz', (_req, res) => {
	res.json({
		status: 'ok',
		configured: Boolean(config.openAiKey),
		uptime: Math.round(process.uptime())
	})
})

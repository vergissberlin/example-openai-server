import { Router } from 'express'
import { config } from '../config.js'
import { ApiError, badRequest, fromUpstream } from '../errors.js'
import { getClient } from '../openai.js'
import { chatCompletionSchema } from '../schemas.js'
import type { ChatCompletionRequest } from '../schemas.js'

export const chatRouter = Router()

chatRouter.post('/v1/chat/completions', async (req, res, next) => {
	const parsed = chatCompletionSchema.safeParse(req.body)

	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
			.join('; ')
		return next(badRequest(detail))
	}

	const request = parsed.data

	try {
		if (request.stream) {
			await streamCompletion(request, res)
		} else {
			await sendCompletion(request, res)
		}
	} catch (error) {
		next(error instanceof ApiError ? error : fromUpstream(error))
	}
})

async function sendCompletion(request: ChatCompletionRequest, res: import('express').Response) {
	const completion = await getClient().chat.completions.create({
		model: request.model,
		messages: request.messages,
		temperature: request.temperature,
		top_p: request.top_p,
		max_tokens: request.max_tokens,
		stream: false
	})

	res.json(completion)
}

/**
 * Streams the upstream response straight through as SSE.
 *
 * Two things matter here beyond forwarding bytes:
 *
 * - the response is not buffered anywhere. `X-Accel-Buffering: no` is what
 *   stops a reverse proxy from holding the whole stream until it completes,
 *   which turns streaming back into a single slow response.
 * - if the client goes away, the upstream request is aborted too. Without
 *   that, a user pressing "stop" in the browser leaves a generation running
 *   to completion, billed in full.
 */
async function streamCompletion(request: ChatCompletionRequest, res: import('express').Response) {
	const controller = new AbortController()

	/*
	 * Abort detection hangs off the *response*, not the request.
	 *
	 * On current Node, `req`'s 'close' event fires as soon as the request
	 * stream is fully consumed — which for a POST with a body is immediately
	 * after parsing, long before the client goes anywhere. Aborting on that
	 * kills every stream before its first chunk.
	 *
	 * `res`'s 'close' fires both on a normal finish and on a client
	 * disconnect, so `writableEnded` is what tells the two apart.
	 */
	res.on('close', () => {
		if (!res.writableEnded) controller.abort()
	})

	let stream
	try {
		stream = await getClient().chat.completions.create(
			{
				model: request.model,
				messages: request.messages,
				temperature: request.temperature,
				top_p: request.top_p,
				max_tokens: request.max_tokens,
				stream: true
			},
			{ signal: controller.signal }
		)
	} catch (error) {
		// Nothing has been written yet, so this can still be a normal HTTP
		// error response.
		throw fromUpstream(error)
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no'
	})
	res.flushHeaders?.()

	try {
		for await (const chunk of stream) {
			if (controller.signal.aborted) break
			res.write(`data: ${JSON.stringify(chunk)}\n\n`)
		}

		if (!controller.signal.aborted) {
			res.write('data: [DONE]\n\n')
		}
	} catch (error) {
		// A client that disconnected is not a failure worth reporting.
		if (controller.signal.aborted) return

		/*
		 * Past this point the status line is already sent, so an error cannot
		 * be signalled with an HTTP code any more. It goes out as an SSE error
		 * event instead, which is what the client is written to expect.
		 */
		const mapped = fromUpstream(error)
		res.write(`event: error\ndata: ${JSON.stringify(mapped.toBody())}\n\n`)
	} finally {
		res.end()
	}
}

chatRouter.get('/v1/models', async (_req, res, next) => {
	try {
		const upstream = await getClient().models.list()

		// Only the whitelisted models are advertised. Listing everything the
		// account can reach would invite requests this proxy then rejects.
		const available = upstream.data
			.filter((model) => config.allowedModels.includes(model.id))
			.map((model) => ({
				id: model.id,
				object: 'model' as const,
				created: model.created,
				owned_by: model.owned_by
			}))

		res.json({ object: 'list', data: available })
	} catch (error) {
		next(error instanceof ApiError ? error : fromUpstream(error))
	}
})

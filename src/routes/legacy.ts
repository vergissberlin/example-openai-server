import { Router } from 'express'
import { config } from '../config.js'
import { ApiError, fromUpstream } from '../errors.js'
import { getClient } from '../openai.js'
import { legacyPromptSchema } from '../schemas.js'

/**
 * The routes the previous version exposed.
 *
 * @deprecated Kept only so the currently deployed client keeps working while
 * it is updated to the /v1 API. They answer in exactly the old shape —
 * `{ text }` and `{ image }` — but run on the current SDK underneath, because
 * the model the old implementation called (`text-davinci-003`) was retired by
 * OpenAI and the code could no longer work at all.
 *
 * Remove these once the client PR is merged and deployed.
 */
export const legacyRouter = Router()

legacyRouter.get('/text/', async (req, res, next) => {
	const parsed = legacyPromptSchema.safeParse(req.query)

	if (!parsed.success) {
		// The old route answered 200 with a message in the body rather than a
		// status code, and the deployed client relies on that shape.
		res.json({ text: 'No prompt provided' })
		return
	}

	try {
		const completion = await getClient().chat.completions.create({
			model: config.defaultModel,
			messages: [{ role: 'user', content: parsed.data.prompt }],
			max_tokens: Math.min(1000, config.maxTokensLimit),
			temperature: 0.5,
			stream: false
		})

		// The old client strips a leading double newline, so the two are kept
		// for byte-compatible behaviour.
		res.json({ text: `\n\n${completion.choices[0]?.message?.content ?? ''}` })
	} catch (error) {
		next(error instanceof ApiError ? error : fromUpstream(error))
	}
})

legacyRouter.get('/image/', async (req, res, next) => {
	const parsed = legacyPromptSchema.safeParse(req.query)

	if (!parsed.success) {
		res.json({ image: 'No prompt provided' })
		return
	}

	try {
		const result = await getClient().images.generate({
			model: 'dall-e-2',
			prompt: parsed.data.prompt,
			n: 1,
			size: '512x512'
		})

		const url = result.data?.[0]?.url
		if (!url) {
			res.json({ image: 'No image found' })
			return
		}

		res.json({ image: url })
	} catch (error) {
		next(error instanceof ApiError ? error : fromUpstream(error))
	}
})

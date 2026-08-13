import { Router } from 'express'
import { ApiError, badRequest, fromUpstream } from '../errors.js'
import { getClient } from '../openai.js'
import { imageGenerationSchema } from '../schemas.js'

export const imagesRouter = Router()

imagesRouter.post('/v1/images/generations', async (req, res, next) => {
	const parsed = imageGenerationSchema.safeParse(req.body)

	if (!parsed.success) {
		const detail = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
			.join('; ')
		return next(badRequest(detail))
	}

	try {
		const result = await getClient().images.generate({
			model: 'dall-e-2',
			prompt: parsed.data.prompt,
			n: parsed.data.n,
			size: parsed.data.size
		})

		res.json(result)
	} catch (error) {
		next(error instanceof ApiError ? error : fromUpstream(error))
	}
})

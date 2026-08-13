import { z } from 'zod'
import { config } from './config.js'

/**
 * Request validation.
 *
 * Everything a caller can influence is bounded here rather than at the
 * upstream: the model against a whitelist, the sampling parameters against
 * their valid ranges, and the token budget against a server-side ceiling.
 * Without that, one request can cost whatever the caller decides.
 */

const roleSchema = z.enum(['system', 'user', 'assistant'])

const messageSchema = z.object({
	role: roleSchema,
	content: z.string().max(100_000)
})

/** Falls back to the default model, then checks it against the whitelist. */
const modelSchema = z
	.string()
	.optional()
	.transform((value) => value ?? config.defaultModel)
	.refine((value) => config.allowedModels.includes(value), {
		message: 'This model is not available on this server.'
	})

export const chatCompletionSchema = z.object({
	model: modelSchema,
	messages: z.array(messageSchema).min(1).max(200),
	stream: z.boolean().default(false),
	temperature: z.number().min(0).max(2).default(0.7),
	top_p: z.number().min(0).max(1).default(1),
	// Clamped rather than rejected: a client asking for more than the ceiling
	// gets the ceiling, which is friendlier than a 400 and just as safe.
	max_tokens: z
		.number()
		.int()
		.positive()
		.optional()
		.transform((value) => Math.min(value ?? config.maxTokensLimit, config.maxTokensLimit))
})

export type ChatCompletionRequest = z.infer<typeof chatCompletionSchema>

export const imageGenerationSchema = z.object({
	prompt: z.string().min(1).max(4000),
	n: z.number().int().min(1).max(4).default(1),
	size: z.enum(['256x256', '512x512', '1024x1024']).default('512x512')
})

export type ImageGenerationRequest = z.infer<typeof imageGenerationSchema>

/** Query shape of the deprecated `/text/` and `/image/` routes. */
export const legacyPromptSchema = z.object({
	prompt: z.string().min(1).max(100_000)
})

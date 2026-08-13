import 'dotenv/config'
import { z } from 'zod'

/**
 * Environment configuration, validated once at startup.
 *
 * Failing here is deliberate: a proxy that boots without a key, or with an
 * unparseable limit, only fails later at request time where it is harder to
 * diagnose.
 */

const csv = z
	.string()
	.transform((value) =>
		value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
	)
	.pipe(z.array(z.string()))

const schema = z
	.object({
		PORT: z.coerce.number().int().positive().default(3000),
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

		// Accepts the name used by the previous version as well, so an existing
		// deployment keeps working without touching its variables.
		OPENAI_API_KEY: z.string().min(1).optional(),
		OPENAI_KEY: z.string().min(1).optional(),
		OPENAI_ORG: z.string().optional(),

		/**
		 * Origins allowed to call this proxy.
		 *
		 * There is deliberately no wildcard default. The previous version fell back
		 * to `*`, which let any page on the internet spend the key's budget.
		 */
		// Local development only. A deployment must set this explicitly — there is
		// no origin here that would work in production by accident, which is the
		// point: a wrong value fails loudly in the browser instead of quietly
		// letting everyone in.
		ALLOWED_ORIGINS: csv.default(['http://localhost:5173']),

		/**
		 * Models this proxy will forward. Without a whitelist, a caller can ask for
		 * the most expensive model available on the account.
		 */
		ALLOWED_MODELS: csv.default(['gpt-4o-mini', 'gpt-4o']),
		DEFAULT_MODEL: z.string().default('gpt-4o-mini'),

		/** Hard ceiling per request, whatever the caller asks for. */
		MAX_TOKENS_LIMIT: z.coerce.number().int().positive().default(2048),

		RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
		RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

		/** Rejects oversized prompt payloads before they reach the upstream. */
		MAX_BODY_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(128 * 1024)
	})
	// Neither key field can be required on its own, because either name is
	// accepted — so without this the object parses happily with both absent.
	// The proxy would then start, pass its own health check, and answer every
	// actual request with a 500. That is precisely the failure this file's
	// header promises not to allow, and it matters more now that the image is
	// published publicly: starting one misconfigured has to be loud.
	.refine((env) => Boolean(env.OPENAI_API_KEY ?? env.OPENAI_KEY), {
		message: 'Set OPENAI_API_KEY (or the legacy OPENAI_KEY).',
		path: ['OPENAI_API_KEY']
	})

/**
 * Exported so the tests can feed it an environment of their own. Production
 * code wants the `config` constant below, which is this applied to
 * `process.env`.
 */
export function parseConfig(source: Record<string, unknown> = process.env) {
	const parsed = schema.safeParse(source)

	if (!parsed.success) {
		// Print the offending fields, never the values — they may hold the key.
		const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
		throw new Error(`Invalid environment configuration. Check: ${fields}`)
	}

	const env = parsed.data

	return {
		port: env.PORT,
		nodeEnv: env.NODE_ENV,
		// The refinement above guarantees that one of the two is present.
		openAiKey: (env.OPENAI_API_KEY ?? env.OPENAI_KEY) as string,
		openAiOrg: env.OPENAI_ORG,
		allowedOrigins: env.ALLOWED_ORIGINS,
		allowedModels: env.ALLOWED_MODELS,
		defaultModel: env.DEFAULT_MODEL,
		maxTokensLimit: env.MAX_TOKENS_LIMIT,
		rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
		rateLimitMax: env.RATE_LIMIT_MAX,
		maxBodyBytes: env.MAX_BODY_BYTES
	} as const
}

export const config = parseConfig()

export type Config = ReturnType<typeof parseConfig>

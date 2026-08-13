/**
 * Errors this proxy reports to callers.
 *
 * Upstream errors are mapped onto these rather than forwarded verbatim: an
 * OpenAI error body can carry request ids, organisation names and occasionally
 * fragments of the request itself, none of which a browser client should see.
 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string
	) {
		super(message)
		this.name = 'ApiError'
	}

	/** The OpenAI-shaped error body clients already know how to read. */
	toBody() {
		return { error: { message: this.message, type: this.code, code: this.code } }
	}
}

export const badRequest = (message: string) => new ApiError(message, 400, 'invalid_request_error')
export const notFound = (message: string) => new ApiError(message, 404, 'not_found_error')

/**
 * Maps an upstream failure onto something safe to return.
 *
 * Status codes are preserved where they are meaningful to the caller (rate
 * limits, bad requests) but the message is ours.
 */
export function fromUpstream(error: unknown): ApiError {
	const status = extractStatus(error)

	if (status === 401 || status === 403) {
		// The caller cannot fix this and must not learn anything about the key.
		return new ApiError(
			'The server is not configured with valid upstream credentials.',
			502,
			'upstream_auth_error'
		)
	}
	if (status === 429) {
		return new ApiError(
			'The upstream rate limit was reached. Try again shortly.',
			429,
			'rate_limit_error'
		)
	}
	if (status === 400 || status === 404 || status === 422) {
		return new ApiError('The upstream rejected the request.', 400, 'invalid_request_error')
	}

	return new ApiError('The upstream request failed.', 502, 'upstream_error')
}

function extractStatus(error: unknown): number | undefined {
	if (typeof error === 'object' && error !== null && 'status' in error) {
		const status = (error as { status?: unknown }).status
		if (typeof status === 'number') return status
	}
	return undefined
}

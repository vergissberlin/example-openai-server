# Example OpenAI server

An OpenAI-compatible proxy for the
[example chat client](https://github.com/vergissberlin/example-openai-vuejs).
It holds the API key server-side, so the browser never sees one.

Because the API is OpenAI-compatible, the same client code that talks to this
server also talks to Ollama, LM Studio or OpenAI directly — only the base URL
changes.

## API

| Route | Purpose |
| --- | --- |
| `POST /v1/chat/completions` | Chat. With `"stream": true` the reply arrives as SSE, token by token. |
| `GET /v1/models` | The models this server will accept. |
| `POST /v1/images/generations` | Image generation. |
| `GET /healthz` | Liveness probe. Answers without calling upstream. |

### Deprecated

`GET /text/?prompt=` and `GET /image/?prompt=` are kept only so the currently
deployed client keeps working until it is updated. They answer in the old
shape and will be removed.

## Requirements

- Node.js >= 22 (the OpenAI SDK requires it)
- [pnpm](https://pnpm.io/) — `corepack enable` picks up the pinned version

## Setup

```bash
pnpm install
cp .env.example .env   # then set OPENAI_API_KEY
pnpm dev
```

```bash
pnpm test         # vitest, upstream stubbed — no request ever leaves the machine
pnpm lint
pnpm type-check
pnpm build && pnpm start
```

Check that streaming works end to end:

```bash
curl -N -X POST localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

You should see `data:` lines arriving one by one, ending in `data: [DONE]`.

## Configuration

See `.env.example` for the full list. The four that matter:

| Variable | Why it matters |
| --- | --- |
| `OPENAI_API_KEY` | The upstream key. Never leaves the server. `OPENAI_KEY` is still read as a fallback. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. **There is no wildcard default** — see below. |
| `ALLOWED_MODELS` | Models this server will forward. Anything else is rejected. |
| `MAX_TOKENS_LIMIT` | Ceiling per request, applied whatever the caller asks for. |

## Deployment (Coolify)

In Coolify, create an application from this repository with the **Docker
Compose** build pack (`compose.yaml`) and assign it a domain. The container
listens on port 3000 and answers `/healthz` without calling upstream, so it is
safe to use as the health check.

Set these as environment variables:

| Name | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Read at runtime. Never baked into the image. |
| `ALLOWED_ORIGINS` | yes | The client's origin, e.g. `https://chat.example.com`. Comma-separated for several. |
| `OPENAI_ORG` | no | |
| `ALLOWED_MODELS`, `DEFAULT_MODEL` | no | Defaults to `gpt-4o-mini,gpt-4o`. |
| `MAX_TOKENS_LIMIT`, `RATE_LIMIT_*` | no | See `.env.example`. |

`ALLOWED_ORIGINS` has no production default on purpose. The client runs on a
separate subdomain, so its origin has to be named here — and the failure mode
is a CORS error in the browser console, which is far easier to diagnose than a
wildcard that silently lets every site on the internet spend this key's budget.
The compose file refuses to start without it.

## Security

This proxy sits in front of a key that costs money, so the defaults are
restrictive:

- **The key stays server-side.** It is never in a response body, never in a
  log, and upstream errors are mapped to generic messages rather than
  forwarded — an upstream error body can name the organisation or quote the
  request back.
- **CORS is an allowlist, not `*`.** A wildcard lets any page on the internet
  call this server and spend the key's budget.
- **Requests are validated and bounded**: model whitelist, clamped sampling
  parameters, a server-side token ceiling and a body size limit.
- **Rate limited per IP.**
- **Logs carry metadata only** — method, path, status, duration. Prompts and
  completions are potentially personal data and are never written out.

**One honest limitation:** a publicly reachable proxy with no authentication
is still abusable, rate limiting or not. That is acceptable for a demo behind
a spending cap. Anything beyond that needs real authentication in front of it.

## License

[MIT](https://opensource.org/licenses/MIT)

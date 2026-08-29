import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

import { translateWithXai } from './translation.mjs'

const MAX_BODY_BYTES = 4 * 1024
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173'])

function sendJson(response, status, payload, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-security-policy': "default-src 'none'",
    'cross-origin-resource-policy': 'same-site',
    'x-content-type-options': 'nosniff',
  }

  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers.vary = 'Origin'
  }

  response.writeHead(status, headers)
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('REQUEST_TOO_LARGE')
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && LOCAL_ORIGINS.has(origin)
}

export function createApiServer({ apiKey, model = 'grok-4.3', translate = translateWithXai } = {}) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin

    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, {
        error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
      })
      return
    }

    if (request.method === 'OPTIONS' && request.url === '/v1/translate') {
      response.writeHead(204, {
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-origin': origin,
        vary: 'Origin',
      })
      response.end()
      return
    }

    if (request.method !== 'POST' || request.url !== '/v1/translate') {
      sendJson(response, 404, {
        error: { code: 'NOT_FOUND', message: 'Route not found.' },
      }, origin)
      return
    }

    if (!apiKey) {
      sendJson(response, 503, {
        error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Translation service is not configured.' },
      }, origin)
      return
    }

    try {
      const input = await readJsonBody(request)
      const result = await translate({ apiKey, model }, input)
      sendJson(response, 200, result, origin)
    } catch (error) {
      const isClientError = error instanceof TypeError || error?.message === 'INVALID_JSON' || error?.message === 'REQUEST_TOO_LARGE'
      const status = isClientError ? 422 : 502
      const code = error?.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : isClientError ? 'INVALID_REQUEST' : 'TRANSLATION_UNAVAILABLE'
      const message = error?.message === 'REQUEST_TOO_LARGE'
        ? 'Translation request is too large.'
        : isClientError
          ? 'Translation request is invalid.'
          : 'Translation is temporarily unavailable.'

      sendJson(response, status, { error: { code, message } }, origin)
    }
  })
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 8787)
  const server = createApiServer({
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_TRANSLATION_MODEL ?? 'grok-4.3',
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`WA-NGAI local API listening on http://127.0.0.1:${port}`)
  })
}

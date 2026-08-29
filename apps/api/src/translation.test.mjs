import assert from 'node:assert/strict'
import test from 'node:test'

import { translateWithXai } from './translation.mjs'

test('sends a bounded English-to-Thai translation request without exposing the key', async () => {
  const fetchCalls = []
  const result = await translateWithXai(
    {
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        fetchCalls.push({ url, options })
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"translation":"ไปที่ประตูเหนือ"}' } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
    {
      sourceLanguage: 'en',
      targetLanguage: 'th',
      text: 'Go to the north gate.',
      context: ['We need to regroup.', 'The north gate is open.'],
    },
  )

  assert.equal(result.text, 'ไปที่ประตูเหนือ')
  assert.equal(fetchCalls[0].url, 'https://api.x.ai/v1/chat/completions')
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer test-key')
  assert.equal(JSON.parse(fetchCalls[0].options.body).model, 'grok-4.3')
  assert.deepEqual(JSON.parse(JSON.parse(fetchCalls[0].options.body).messages[1].content).context, [
    'We need to regroup.',
    'The north gate is open.',
  ])
})

test('rejects an empty or oversized translation request before it reaches xAI', async () => {
  await assert.rejects(
    () => translateWithXai({ apiKey: 'test-key' }, { sourceLanguage: 'en', targetLanguage: 'th', text: ' ' }),
    /text/i,
  )

  await assert.rejects(
    () => translateWithXai({ apiKey: 'test-key' }, { sourceLanguage: 'en', targetLanguage: 'th', text: 'x'.repeat(501) }),
    /text/i,
  )
})

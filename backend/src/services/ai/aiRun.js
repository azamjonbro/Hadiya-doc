import { getAnthropicClient, AI_CHAT_MODEL } from '../../ai/anthropicClient.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * The one place generation talks to the model (10.1).
 *
 * Everything about how the call is made lives here so the generators are
 * prompts and schemas rather than API plumbing:
 *
 *   - **Structured outputs.** The answer has to become rows in Mongo, so it
 *     is requested as JSON against a schema (`output_config.format`) rather
 *     than parsed out of prose. Asking a model to "reply with JSON only"
 *     and hoping is how a generator fails on the one document that made it
 *     add a sentence of explanation first.
 *   - **Streaming for long answers.** A course outline with lessons is tens
 *     of thousands of tokens; a non-streamed request that large runs into
 *     the SDK's HTTP timeout before the model has finished. Anything above
 *     the non-streaming ceiling streams and is collected at the end.
 *   - **Refusals are a normal outcome**, not an exception: the model may
 *     decline, and the job records that as a failure the author can read.
 */

// Comfortably inside the SDK's non-streaming timeout.
const NON_STREAMING_CEILING = 16000

export const AI_GENERATION_MODEL = AI_CHAT_MODEL

function textOf(message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
}

function usageOf(message) {
  return {
    model: message.model ?? AI_GENERATION_MODEL,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
  }
}

/**
 * @param {{system: string, prompt: string, schema: object, maxTokens?: number, effort?: string}} options
 * @returns {Promise<{data: any, usage: {model: string, inputTokens: number, outputTokens: number, cacheReadTokens: number}}>}
 */
export async function generateStructured({ system, prompt, schema, maxTokens = 16000, effort = 'high' }) {
  const client = getAnthropicClient()
  if (!client) throw ApiError.badRequest('AI is not configured on this server', 'AI_NOT_CONFIGURED')

  const request = {
    model: AI_GENERATION_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  }

  let message
  try {
    if (maxTokens > NON_STREAMING_CEILING) {
      const stream = client.messages.stream(request)
      message = await stream.finalMessage()
    } else {
      message = await client.messages.create(request)
    }
  } catch (error) {
    logger.warn('AI generation request failed', { error: error.message, status: error.status })
    throw ApiError.internal('The AI request failed', 'AI_REQUEST_FAILED')
  }

  if (message.stop_reason === 'refusal') {
    // The category, not the whole explanation: it is enough for the author
    // to know the model declined and roughly why, and the explanation is
    // written for a developer.
    throw ApiError.badRequest('The model declined this request', 'AI_REFUSED', {
      category: message.stop_details?.category ?? null,
    })
  }

  const text = textOf(message)
  if (!text) throw ApiError.internal('The model returned nothing', 'AI_EMPTY_RESPONSE')

  let data
  try {
    data = JSON.parse(text)
  } catch {
    // With a schema attached this should not happen; if it does, the job
    // records it rather than a stack trace reaching the author.
    logger.warn('AI generation returned unparseable JSON', { chars: text.length })
    throw ApiError.internal('The model returned a malformed answer', 'AI_BAD_JSON')
  }

  // `max_tokens` means the JSON was cut off mid-structure — it parsed only
  // if the schema happened to close, so this is checked explicitly.
  if (message.stop_reason === 'max_tokens') {
    logger.warn('AI generation hit the token ceiling', { maxTokens })
    throw ApiError.badRequest('The answer was too long to finish — try a smaller source', 'AI_TRUNCATED')
  }

  return { data, usage: usageOf(message) }
}

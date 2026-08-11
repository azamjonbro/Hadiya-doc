import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'

// Constructed lazily (not at import time) so a missing key doesn't crash
// boot — aiChat.service checks env.ANTHROPIC_API_KEY itself before ever
// reaching this, but this guard keeps the module safe to import anywhere.
let client = null

export function getAnthropicClient() {
  if (!env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export const AI_CHAT_MODEL = 'claude-opus-5'

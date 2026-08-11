import winston from 'winston'
import { env } from './env.js'

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'captchatoken',
])

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact)
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(val)
    }
    return out
  }
  return value
}

const PRESERVED_KEYS = new Set(['level', 'message', 'timestamp'])

// Mutates `info` in place (rather than returning a new object) so winston's
// internal Symbol('level')/Symbol('message') properties survive — later
// formats like colorize() read those symbols, not just the plain keys.
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (PRESERVED_KEYS.has(key)) continue
    info[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(info[key])
  }
  return info
})

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    env.isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [new winston.transports.Console()],
})

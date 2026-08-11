import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

let warnedAboutBypass = false

// hCaptcha verification is skipped when CAPTCHA_SECRET is unset, which is
// only meant for local development — production deployments must set a
// real secret or every login silently bypasses captcha.
export async function verifyCaptcha(captchaToken) {
  if (!env.CAPTCHA_SECRET) {
    if (!warnedAboutBypass) {
      logger.warn('CAPTCHA_SECRET is not set — captcha verification is bypassed in this environment')
      warnedAboutBypass = true
    }
    return
  }

  if (!captchaToken) {
    throw ApiError.badRequest('Captcha verification is required', 'CAPTCHA_REQUIRED')
  }

  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env.CAPTCHA_SECRET, response: captchaToken }),
  })

  const result = await response.json()
  if (!result.success) {
    throw ApiError.badRequest('Captcha verification failed', 'CAPTCHA_FAILED')
  }
}

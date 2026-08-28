import { i18n } from '@/i18n'

/**
 * The one place an API failure becomes a sentence a person can read.
 *
 * The server's `message` is English and always will be — it is written for
 * whoever reads the logs. What travels for the user is `code`, which this
 * looks up under `errors.<CODE>` in the active locale, interpolating
 * `details` when the sentence needs a number (how many employees still hold
 * the role, how many megabytes the file may be).
 *
 * The fallback order matters: a translated code first, then the server's own
 * words, then whatever the caller offered. An untranslated code showing its
 * English text is worse than a translation and better than "Something went
 * wrong" — it still says which thing went wrong.
 */
export function apiErrorText(error, fallback = '') {
  const { t, te } = i18n.global

  // No response at all: the request never reached the API — offline, DNS,
  // CORS, a dropped connection. There is no code to translate here.
  if (error && !error.response) {
    if (error.code === 'ECONNABORTED') return t('errors.timeout')
    return t('errors.network')
  }

  const data = error?.response?.data
  const code = data?.code

  if (code) {
    const key = `errors.${code}`
    if (te(key)) return t(key, data.details ?? {})
  }

  return data?.message || fallback || t('errors.unknown')
}

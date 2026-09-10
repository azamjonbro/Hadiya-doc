/**
 * What must not leave the building (10.6).
 *
 * Generation runs on documents an author picked off their own machine, and
 * the documents in an HR department are not course material — a "safety
 * briefing" export routinely carries the attendance list, and an attendance
 * list here means JSHSHIRs. Sending those to a model API is a disclosure of
 * personal data that nobody asked for and nobody would notice.
 *
 * So the text is redacted on the way *out*, before the prompt is built.
 * Placeholders rather than deletion: a sentence with `[ID]` in it still
 * reads as a sentence, and the model's answer keeps the shape of the
 * source. Nothing here is reversible — the redacted text is what the model
 * sees, and the original is never stored (sourceExtract keeps no copy).
 *
 * This is a floor, not a guarantee. A name is not detectable by pattern and
 * is not redacted; the rule the platform can enforce is that *identifiers*
 * do not travel.
 */

// JSHSHIR: exactly fourteen digits, the identifier this platform uses as a
// login. Bounded by non-digits so a longer number is not half-redacted.
const JSHSHIR = /(?<!\d)\d{14}(?!\d)/g
// Uzbek mobile numbers in the shapes people actually type, including the
// +998 (90) 123-45-67 form.
const PHONE = /(?<!\d)(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g
// Passport series: two Latin letters then seven digits (AA1234567).
const PASSPORT = /(?<![A-Za-z\d])[A-Z]{2}\s?\d{7}(?![\d])/g
// Long digit runs that are none of the above — card and account numbers.
const LONG_NUMBER = /(?<!\d)\d{16,20}(?!\d)/g

const RULES = [
  { name: 'jshshir', pattern: JSHSHIR, placeholder: '[JSHSHIR]' },
  { name: 'passport', pattern: PASSPORT, placeholder: '[PASSPORT]' },
  { name: 'account', pattern: LONG_NUMBER, placeholder: '[NUMBER]' },
  { name: 'email', pattern: EMAIL, placeholder: '[EMAIL]' },
  // Phones last: the pattern is the loosest of the five, and running it
  // first would swallow the leading digits of an identifier the stricter
  // rules would have caught whole.
  { name: 'phone', pattern: PHONE, placeholder: '[PHONE]' },
]

/**
 * @returns {{text: string, redactions: Record<string, number>, total: number}}
 */
export function redactPii(source) {
  let text = String(source ?? '')
  const redactions = {}

  for (const rule of RULES) {
    let count = 0
    text = text.replace(rule.pattern, () => {
      count += 1
      return rule.placeholder
    })
    if (count) redactions[rule.name] = count
  }

  return {
    text,
    redactions,
    total: Object.values(redactions).reduce((sum, count) => sum + count, 0),
  }
}

/** For the test that proves the rules are wired in, not just present. */
export const PII_RULE_NAMES = RULES.map((rule) => rule.name)

/**
 * Uzbek Latin month and weekday names, for a runtime that has none.
 *
 * Chrome ships no CLDR names for `uz`: `toLocaleDateString('uz', { month:
 * 'short' })` returns "M09", and a date reads "2026 M09 12". Every screen
 * that prints a date hit this — the library table, the calendar's heading
 * and columns, the news feed, the certificates.
 *
 * Twenty-seven call sites formatted dates directly, so the fix is applied
 * where the gap is rather than at each of them: `toLocaleDateString` and
 * `toLocaleString` are wrapped once, at boot, and only act when the asked
 * locale is Uzbek *and* the options ask for a month or weekday name. Every
 * other locale, and every numeric-only format, goes straight to the
 * runtime untouched. Install once from main.js.
 *
 * The parts come from `en-GB` — a locale Chrome does have, with the same
 * day-month-year order — and the English names are then swapped for ours,
 * so the separators, the hour format and the year stay the runtime's.
 */
const MONTHS_LONG = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek']
// Sunday first, like Date#getDay.
const WEEKDAYS_LONG = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba']
const WEEKDAYS_SHORT = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Jum', 'Shan']

const isUzbek = (locale) => {
  const tag = Array.isArray(locale) ? locale[0] : locale
  return typeof tag === 'string' && tag.toLowerCase().startsWith('uz')
}
// Only a *name* needs our tables; 'numeric' and '2-digit' are digits the
// runtime already prints correctly.
const wantsNames = (options) =>
  Boolean(options) && (options.month === 'long' || options.month === 'short' || options.weekday === 'long' || options.weekday === 'short')

function format(date, options) {
  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date)
  return parts
    .map((part) => {
      if (part.type === 'month' && (options.month === 'long' || options.month === 'short')) {
        return (options.month === 'long' ? MONTHS_LONG : MONTHS_SHORT)[date.getMonth()]
      }
      if (part.type === 'weekday') {
        return (options.weekday === 'long' ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[date.getDay()]
      }
      return part.value
    })
    .join('')
}

export function installUzbekDateNames() {
  if (Date.prototype.toLocaleDateString.__uz) return
  const date = Date.prototype.toLocaleDateString
  const both = Date.prototype.toLocaleString

  function wrap(original) {
    function wrapped(locale, options) {
      if (isUzbek(locale) && wantsNames(options)) return format(this, options)
      return original.call(this, locale, options)
    }
    wrapped.__uz = true
    return wrapped
  }

  Date.prototype.toLocaleDateString = wrap(date)
  Date.prototype.toLocaleString = wrap(both)
}

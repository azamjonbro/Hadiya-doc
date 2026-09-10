import { createI18n } from 'vue-i18n'
import uz from './locales/uz.json'
import ru from './locales/ru.json'
import en from './locales/en.json'

const STORAGE_KEY = 'lms-locale'

// A module may keep its own strings next to itself instead of growing the
// three big locale files — four agents adding keys to one JSON file is a
// merge conflict per key. A fragment is `{ uz: {...}, ru: {...}, en: {...} }`
// and is merged in below; the big files stay authoritative for anything a
// fragment does not mention.
const fragments = import.meta.glob('./locales/modules/*.json', { eager: true })

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeInto(target[key] ?? {}, value)
    } else {
      target[key] = value
    }
  }
  return target
}

const messages = { uz, ru, en }
for (const fragment of Object.values(fragments)) {
  const bundle = fragment.default ?? fragment
  for (const locale of ['uz', 'ru', 'en']) {
    if (bundle[locale]) mergeInto(messages[locale], bundle[locale])
  }
}

function getInitialLocale() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'uz' || stored === 'ru' || stored === 'en') return stored
  return 'uz'
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages,
})

export function setLocale(locale) {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export const availableLocales = ['uz', 'ru', 'en']

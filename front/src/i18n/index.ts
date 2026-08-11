import { createI18n } from 'vue-i18n'
import uz from './locales/uz.json'
import ru from './locales/ru.json'
import en from './locales/en.json'

export type SupportedLocale = 'uz' | 'ru' | 'en'

const STORAGE_KEY = 'lms-locale'

function getInitialLocale(): SupportedLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'uz' || stored === 'ru' || stored === 'en') return stored
  return 'uz'
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages: { uz, ru, en },
})

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

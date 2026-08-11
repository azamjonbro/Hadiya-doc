import { defineStore } from 'pinia'

const STORAGE_KEY = 'lms-theme'

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: getInitialTheme(),
  }),
  actions: {
    toggle() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      this.apply()
    },
    apply() {
      document.documentElement.classList.toggle('dark', this.theme === 'dark')
      localStorage.setItem(STORAGE_KEY, this.theme)
    },
  },
})

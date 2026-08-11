import { defineStore } from 'pinia'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'lms-admin-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: getInitialTheme() as Theme,
  }),
  actions: {
    toggle(): void {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      this.apply()
    },
    apply(): void {
      document.documentElement.classList.toggle('dark', this.theme === 'dark')
      localStorage.setItem(STORAGE_KEY, this.theme)
    },
  },
})

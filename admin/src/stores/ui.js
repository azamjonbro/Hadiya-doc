import { defineStore } from 'pinia'

const STORAGE_KEY = 'lms-sidebar-collapsed'

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebarCollapsed: localStorage.getItem(STORAGE_KEY) === '1',
    mobileNavOpen: false,
  }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      localStorage.setItem(STORAGE_KEY, this.sidebarCollapsed ? '1' : '0')
    },
  },
})

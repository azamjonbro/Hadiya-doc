import { defineStore } from 'pinia'
import { projectsApi } from '@/services/projects'

/**
 * The project list, shared by the section column (which draws it under
 * «LOYIHALAR») and the project page (which renames and deletes into it).
 * One store so a rename in the dialog is on the sidebar the same instant,
 * without the column re-fetching on every route change.
 */
export const useProjectsStore = defineStore('projects', {
  state: () => ({
    items: [],
    loaded: false,
    loading: false,
  }),
  actions: {
    async load({ force = false } = {}) {
      if (this.loading || (this.loaded && !force)) return
      this.loading = true
      try {
        this.items = await projectsApi.list()
        this.loaded = true
      } catch {
        this.items = []
      } finally {
        this.loading = false
      }
    },
    // Sorted by name like the server does, so a fresh project lands where
    // it will be after the next reload rather than at the bottom.
    upsert(project) {
      const index = this.items.findIndex((p) => p.id === project.id)
      const row = { ...(index === -1 ? {} : this.items[index]), ...project }
      if (index === -1) this.items.push(row)
      else this.items[index] = row
      this.items.sort((a, b) => a.name.localeCompare(b.name))
    },
    forget(id) {
      this.items = this.items.filter((p) => p.id !== id)
    },
    // The course count is on the list rows; when a course is filed into or
    // out of a project the sidebar's number should follow.
    bump(id, delta) {
      const row = this.items.find((p) => p.id === id)
      if (row) row.courseCount = Math.max(0, (row.courseCount ?? 0) + delta)
    },
  },
})

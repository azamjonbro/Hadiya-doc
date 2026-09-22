import { defineStore } from 'pinia'

/**
 * «Yaqindagilar» and «Sevimlilar» (the reference's «Недавние» /
 * «Избранное») for the admin library: which courses this person opened
 * lately, and which they starred. Per browser, in localStorage — a mark
 * is a personal bookmark, not a property of the course, and it needs no
 * round trip to be right.
 */
const RECENT_KEY = 'admin-recent-courses'
const FAVORITES_KEY = 'admin-favorite-courses'
const RECENT_MAX = 20

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable; the marks then last for the session.
  }
}

export const useCourseMarksStore = defineStore('courseMarks', {
  state: () => ({
    // Newest first.
    recent: read(RECENT_KEY),
    favorites: read(FAVORITES_KEY),
  }),
  actions: {
    touch(id) {
      this.recent = [id, ...this.recent.filter((x) => x !== id)].slice(0, RECENT_MAX)
      write(RECENT_KEY, this.recent)
    },
    isFavorite(id) {
      return this.favorites.includes(id)
    },
    toggleFavorite(id) {
      this.favorites = this.isFavorite(id) ? this.favorites.filter((x) => x !== id) : [id, ...this.favorites]
      write(FAVORITES_KEY, this.favorites)
    },
    forget(id) {
      this.recent = this.recent.filter((x) => x !== id)
      this.favorites = this.favorites.filter((x) => x !== id)
      write(RECENT_KEY, this.recent)
      write(FAVORITES_KEY, this.favorites)
    },
  },
})

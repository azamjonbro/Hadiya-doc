import { ref } from 'vue'
import { kbApi } from '@/services/kb'

// One copy of the space list for the sidebar and the pages under it — the
// tree on the left and the cards in the middle must agree, and both would
// otherwise fetch it.
const categories = ref([])
const loaded = ref(false)
const loading = ref(false)
// The "new space" dialog lives in the layout; the overview's dashed card
// opens it from a page below, so the flag is shared here.
const createSpaceOpen = ref(false)

// A stable colour per space for its card and tree square: the reference
// tints each space, and the API has no colour field yet.
const PALETTE = ['#2563EB', '#16A34A', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626', '#4F46E5']
export function spaceColor(id = '') {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % PALETTE.length
  return PALETTE[hash]
}

export function useKb() {
  async function loadCategories(force = false) {
    if (loaded.value && !force) return categories.value
    loading.value = true
    try {
      categories.value = await kbApi.categories()
      loaded.value = true
    } finally {
      loading.value = false
    }
    return categories.value
  }
  return { categories, loading, loadCategories, createSpaceOpen }
}

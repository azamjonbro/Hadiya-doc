<script setup>
/**
 * The section column (rasn 2, 6, 11, 21…): the section's name in 22px,
 * then its pages, the current one on a grey pill. Rendered only when the
 * section has more than one page the person may open.
 */
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { computed } from 'vue'

const props = defineProps({ section: { type: Object, required: true }, pages: { type: Array, required: true } })
const { t } = useI18n()
const route = useRoute()

// The longest matching page wins, so /bos/ojt/sessions lights "sessions"
// and not the checklists page at /bos/ojt as well.
const activePath = computed(() => {
  let best = ''
  for (const page of props.pages) {
    const hit = route.path === page.path || route.path.startsWith(`${page.path}/`)
    if (hit && page.path.length > best.length) best = page.path
  }
  return best
})
function isActive(path) {
  return activePath.value === path
}
</script>

<template>
  <aside class="w-[248px] shrink-0 px-3 pt-6">
    <h2 class="px-3 text-[22px] font-semibold leading-tight text-ink">{{ t(section.labelKey) }}</h2>
    <ul class="mt-5 space-y-0.5">
      <li v-for="page in pages" :key="page.name">
        <router-link
          :to="page.path"
          class="block rounded-lg px-3 py-2 text-[14px] transition-default"
          :class="isActive(page.path) ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
          :aria-current="isActive(page.path) ? 'page' : undefined"
        >
          {{ t(page.labelKey) }}
        </router-link>
      </li>
    </ul>
  </aside>
</template>

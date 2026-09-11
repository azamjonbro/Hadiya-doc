<script setup>
/**
 * The section column (rasn 2, 6, 11, 21…): the section's name in 22px,
 * then its pages, the current one on a grey pill. Rendered only when the
 * section has more than one page the person may open.
 */
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

defineProps({ section: { type: Object, required: true }, pages: { type: Array, required: true } })
const { t } = useI18n()
const route = useRoute()

function isActive(path) {
  return route.path === path || route.path.startsWith(`${path}/`)
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

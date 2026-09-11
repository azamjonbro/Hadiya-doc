<script setup>
/**
 * The "?" button in the bottom-right corner (rasn 1–27): a dark disc
 * that opens a short list of where help lives — the knowledge base, the
 * API reference, the search shortcut.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@/composables/onClickOutside'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const open = ref(false)
const root = ref(null)
onClickOutside(root, () => (open.value = false))

import { API_BASE_URL } from '@/services/apiBase'
const apiDocs = `${API_BASE_URL.replace(/\/v1\/?$/, '')}/docs`

function openSearch() {
  open.value = false
  window.dispatchEvent(new CustomEvent('lms:search'))
}
</script>

<template>
  <div ref="root" class="fixed bottom-6 right-6 z-30 hidden lg:block">
    <Transition enter-active-class="transition-default" enter-from-class="opacity-0 translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 translate-y-1">
      <div v-if="open" class="absolute bottom-16 right-0 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl">
        <router-link to="/kb" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-ink transition-default hover:bg-surface-2" @click="open = false">
          <Icon name="info" size="16" class="text-ink-muted" />{{ t('portal.nav.kb') }}
        </router-link>
        <a :href="apiDocs" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-ink transition-default hover:bg-surface-2">
          <Icon name="code" size="16" class="text-ink-muted" />{{ t('admin.help.apiDocs') }}
        </a>
        <button type="button" class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-ink transition-default hover:bg-surface-2" @click="openSearch">
          <Icon name="search" size="16" class="text-ink-muted" />{{ t('admin.help.search') }} <kbd class="ml-auto rounded bg-surface-2 px-1.5 text-[11px] text-ink-muted">⌘K</kbd>
        </button>
      </div>
    </Transition>
    <button
      type="button"
      class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2B2B2B] text-white shadow-lg transition-default hover:bg-black"
      :aria-label="t('admin.help.title')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[13px] font-bold">?</span>
    </button>
  </div>
</template>

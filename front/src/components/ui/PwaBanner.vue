<script setup>
/**
 * Two one-line messages, both about the network (12.1).
 *
 * "A new version is ready" — with the button that takes it, never
 * automatically: see `usePwaUpdate`.
 *
 * "You are offline" — because the alternative is a screen of failed
 * requests and a person concluding the platform is broken. It appears on
 * the browser's own `offline` event, which is a *hint* rather than proof
 * (a captive portal reports online), so the wording is about the
 * connection rather than a promise about what still works.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePwaUpdate } from '@/composables/usePwaUpdate'
import { useOfflineQueue } from '@/composables/useOfflineQueue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const { needsRefresh, refresh } = usePwaUpdate()
// 12.3 — how much work is waiting to be sent. Shown next to the offline
// line, because the two are the same story: something happened here that
// the server has not heard about yet.
const { pending } = useOfflineQueue()

const online = ref(true)
const update = () => {
  online.value = navigator.onLine !== false
}

onMounted(() => {
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})
onUnmounted(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>

<template>
  <!-- Bottom rather than top: the top of every screen is already the
       topbar, and a banner that pushes the page down moves whatever
       somebody was about to click. -->
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-3">
    <Transition
      enter-active-class="transition-default"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition-default"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="!online"
        class="pointer-events-auto flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-small text-warning shadow-sm"
      >
        <Icon name="alert-triangle" size="14" />
        {{ t('pwa.offline') }}
        <span v-if="pending" class="text-caption">· {{ t('pwa.pending', { count: pending }) }}</span>
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-default"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition-default"
      leave-to-class="translate-y-2 opacity-0"
    >
      <!-- Online with work still queued: the flush is running or about to,
           and saying so beats a silent gap between "done" and "recorded". -->
      <div
        v-if="online && pending"
        class="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-caption text-ink-muted shadow-sm"
      >
        <Icon name="loader" size="13" class="animate-spin" />
        {{ t('pwa.pending', { count: pending }) }}
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-default"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition-default"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="needsRefresh"
        class="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-small text-ink shadow-md"
      >
        <span class="flex items-center gap-2">
          <Icon name="refresh-cw" size="14" class="text-primary" />
          {{ t('pwa.updateReady') }}
        </span>
        <AppButton size="sm" @click="refresh">{{ t('pwa.reload') }}</AppButton>
        <AppButton variant="ghost" size="sm" @click="needsRefresh = false">{{ t('pwa.later') }}</AppButton>
      </div>
    </Transition>
  </div>
</template>

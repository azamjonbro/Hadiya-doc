<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '@/composables/useNotifications'
import { formatRelative } from '@/utils/chatFormat'

const { t, locale } = useI18n()
const { items, unreadCount, markRead, markAllRead } = useNotifications()
const isOpen = ref(false)

function severityDotClass(severity) {
  if (severity === 'CRITICAL') return 'bg-danger'
  if (severity === 'WARNING') return 'bg-warning'
  return 'bg-info'
}

const timeAgo = (dateString) => formatRelative(dateString, locale.value, t)
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative rounded-md border border-border px-3 py-1 text-sm text-ink transition-default hover:bg-surface-hover"
      @click="isOpen = !isOpen"
    >
      {{ t('notifications.title') }}
      <span
        v-if="unreadCount > 0"
        class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-danger-foreground"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <div
      v-if="isOpen"
      class="absolute right-0 z-20 mt-2 w-80 rounded-md border border-border bg-surface shadow-md"
    >
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <p class="text-small font-medium text-ink">{{ t('notifications.title') }}</p>
        <button type="button" class="text-caption text-primary hover:underline" @click="markAllRead">
          {{ t('notifications.markAllRead') }}
        </button>
      </div>
      <ul class="max-h-96 overflow-y-auto">
        <li
          v-for="n in items"
          :key="n.id"
          class="cursor-pointer border-b border-border px-3 py-2 last:border-0 hover:bg-surface-hover"
          @click="markRead(n)"
        >
          <div class="flex items-start gap-2">
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" :class="[severityDotClass(n.severity), n.read ? 'opacity-30' : '']" />
            <div class="min-w-0 flex-1">
              <p class="text-small text-ink" :class="{ 'font-medium': !n.read }">{{ n.title }}</p>
              <p v-if="n.message" class="text-caption text-ink-muted">{{ n.message }}</p>
              <p class="text-caption text-ink-faint">{{ timeAgo(n.createdAt) }}</p>
            </div>
          </div>
        </li>
        <li v-if="items.length === 0" class="px-3 py-8 text-center text-small text-ink-muted">
          {{ t('notifications.empty') }}
        </li>
      </ul>
    </div>
  </div>
</template>

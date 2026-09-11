<script setup>
/**
 * The bell's drawer (reference §9): a 440px panel, "mark all read" on the
 * right under the title, one row per notification with a green dot while
 * it is unread. The data comes in through props — the top bar already
 * polls `useNotifications()`, and a second subscriber would poll twice.
 */
import { useI18n } from 'vue-i18n'
import Drawer from '@/components/ui/Drawer.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  unreadCount: { type: Number, default: 0 },
  markRead: { type: Function, required: true },
  markAllRead: { type: Function, required: true },
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const typeIcon = {
  TASK_ASSIGNED: 'check-square',
  TASK_DEADLINE_APPROACHING: 'clock',
  TASK_OVERDUE: 'alert-triangle',
  COURSE_ASSIGNED: 'graduation-cap',
  COURSE_DEADLINE_APPROACHING: 'clock',
  COURSE_EXPIRED: 'alert-circle',
  NEWS_PUBLISHED: 'newspaper',
}

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return t('notifications.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('chat.time.minutesAgo', { value: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('chat.time.hoursAgo', { value: hours })
  return t('chat.time.daysAgo', { value: Math.floor(hours / 24) })
}
</script>

<template>
  <Drawer :model-value="modelValue" :title="t('portal.topbar.notifications')" width="max-w-[440px]" @update:model-value="emit('update:modelValue', $event)">
    <div class="-mx-6 -my-5">
      <div class="flex items-center justify-between px-6 py-2">
        <router-link
          to="/settings"
          class="text-caption text-ink-faint transition-default hover:text-ink"
          @click="emit('update:modelValue', false)"
        >
          {{ t('portal.notifications.settings') }}
        </router-link>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="text-caption text-ink-muted transition-default hover:text-ink"
          @click="props.markAllRead()"
        >
          {{ t('notifications.markAllRead') }}
        </button>
      </div>

      <div v-if="items.length === 0" class="flex flex-col items-center px-6 py-16 text-center text-small text-ink-muted">
        <Icon name="bell" size="28" class="mb-3 opacity-40" />
        {{ t('portal.notifications.empty') }}
      </div>

      <ul v-else>
        <li
          v-for="item in items"
          :key="item.id"
          class="flex cursor-pointer items-start gap-3 border-b border-border/60 px-6 py-4 transition-default hover:bg-surface-2"
          @click="props.markRead(item)"
        >
          <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
            <Icon :name="typeIcon[item.type] ?? 'bell'" size="12" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[14px] leading-snug text-ink" :class="item.read ? '' : 'font-medium'">{{ item.title }}</p>
            <p v-if="item.message" class="mt-0.5 line-clamp-2 text-caption text-ink-muted">{{ item.message }}</p>
            <p class="mt-1 text-caption text-ink-faint">{{ timeAgo(item.createdAt) }}</p>
          </div>
          <span v-if="!item.read" class="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        </li>
      </ul>

      <router-link
        to="/notifications"
        class="block border-t border-border px-6 py-3 text-center text-small font-medium text-primary transition-default hover:bg-surface-2"
        @click="emit('update:modelValue', false)"
      >
        {{ t('common.viewAll') }}
      </router-link>
    </div>
  </Drawer>
</template>

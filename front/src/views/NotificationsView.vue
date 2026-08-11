<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()

// Notifications are not yet backed by a list endpoint — realistic mock feed
// standing in for `notification:read` until the API ships.
const items = ref([
  { id: 1, category: 'training', icon: 'graduation-cap', title: "\"Sales Fundamentals\" kursi muddati ertaga tugaydi", time: '12 daq. oldin', unread: true },
  { id: 2, category: 'tasks', icon: 'check-square', title: '"10 ta mijozga qo\'ng\'iroq qilish" vazifasi sizga biriktirildi', time: '1 soat oldin', unread: true },
  { id: 3, category: 'news', icon: 'newspaper', title: 'Yangi kompaniya e\'loni: Q3 natijalari', time: '3 soat oldin', unread: true },
  { id: 4, category: 'system', icon: 'shield', title: 'Yangi qurilmadan kirish aniqlandi', time: 'Kecha, 18:42', unread: false },
  { id: 5, category: 'training', icon: 'award', title: '"Customer Psychology" kursini muvaffaqiyatli tugatdingiz', time: '2 kun oldin', unread: false },
  { id: 6, category: 'events', icon: 'calendar', title: 'Jamoaviy uchrashuv ertaga soat 10:00 da', time: '2 kun oldin', unread: false },
])

const categories = ['all', 'training', 'tasks', 'news', 'system']
const active = ref('all')

const filtered = computed(() => (active.value === 'all' ? items.value : items.value.filter((i) => i.category === active.value)))

function markAllRead() {
  items.value = items.value.map((i) => ({ ...i, unread: false }))
}

const categoryColor = {
  training: 'bg-primary-subtle text-primary',
  tasks: 'bg-warning-subtle text-warning',
  news: 'bg-info-subtle text-info',
  system: 'bg-danger-subtle text-danger',
  events: 'bg-success-subtle text-success',
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-h1 text-ink">{{ t('notifications.title') }}</h1>
      <AppButton variant="ghost" size="sm" icon="check-square" @click="markAllRead">{{ t('notifications.markAllRead') }}</AppButton>
    </div>

    <div class="mt-5 flex items-center gap-1.5 overflow-x-auto">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="shrink-0 rounded-full px-3.5 py-1.5 text-small font-medium transition-default"
        :class="active === cat ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-muted hover:bg-surface-hover'"
        @click="active = cat"
      >
        {{ t('notifications.categories.' + cat) }}
      </button>
    </div>

    <div class="mt-5 divide-y divide-border rounded-lg border border-border bg-surface">
      <div v-for="item in filtered" :key="item.id" class="flex items-start gap-3.5 p-4">
        <span
          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          :class="categoryColor[item.category]"
        >
          <Icon :name="item.icon" size="16" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-small text-ink" :class="item.unread ? 'font-medium' : ''">{{ item.title }}</p>
          <p class="mt-1 text-caption text-ink-faint">{{ item.time }}</p>
        </div>
        <span v-if="item.unread" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
      </div>

      <EmptyState v-if="filtered.length === 0" icon="bell" :title="t('notifications.empty')" />
    </div>
  </div>
</template>

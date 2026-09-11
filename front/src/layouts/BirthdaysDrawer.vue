<script setup>
/**
 * The gift button's drawer (reference §9): 310px, a two-way segment
 * "Yaqinlari / O'tganlari" with counts, one row per colleague. Loaded
 * when opened, once per session — birthdays do not move.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { orgApi } from '@/services/org'
import Drawer from '@/components/ui/Drawer.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const { t, locale } = useI18n()

const data = ref(null)
const failed = ref(false)
const side = ref('upcoming')

async function load() {
  if (data.value) return
  try {
    data.value = await orgApi.birthdays()
  } catch {
    failed.value = true
  }
}

watch(
  () => props.modelValue,
  (open) => open && load(),
)

const rows = computed(() => data.value?.[side.value] ?? [])

function when(row) {
  if (row.daysUntil === 0) return t('portal.birthdays.today')
  const year = new Date().getFullYear()
  const date = new Date(year, row.month - 1, row.day).toLocaleDateString(locale.value, { day: 'numeric', month: 'long' })
  if (row.daysUntil === 1) return `${t('portal.birthdays.tomorrow')} · ${date}`
  return date
}
</script>

<template>
  <Drawer :model-value="modelValue" :title="t('portal.topbar.birthdays')" width="max-w-[310px]" @update:model-value="emit('update:modelValue', $event)">
    <div class="-mx-6 -my-5">
      <div class="px-6 pt-4">
        <div class="flex rounded-lg bg-surface-2 p-0.5">
          <button
            v-for="key in ['upcoming', 'past']"
            :key="key"
            type="button"
            class="h-8 flex-1 rounded-md px-3 text-[13px] transition-default"
            :class="side === key ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted'"
            @click="side = key"
          >
            {{ t(`portal.birthdays.${key}`) }} {{ data ? data[key].length : '' }}
          </button>
        </div>
      </div>

      <div v-if="failed" class="px-6 py-10 text-center text-small text-ink-muted">{{ t('portal.birthdays.loadError') }}</div>
      <div v-else-if="!data" class="space-y-3 px-6 py-5">
        <Skeleton v-for="n in 3" :key="n" class="h-12 w-full rounded-lg" />
      </div>
      <div v-else-if="!rows.length" class="flex flex-col items-center px-6 py-14 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-faint"><Icon name="gift" size="22" /></span>
        <p class="mt-4 text-[14px] text-ink">{{ t(`portal.birthdays.empty.${side}`, { days: data.windowDays }) }}</p>
      </div>
      <ul v-else class="py-2">
        <li v-for="row in rows" :key="row.id" class="flex items-center gap-3 px-6 py-2.5">
          <Avatar :name="row.fullName" :src="row.avatar" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-semibold text-ink">{{ row.fullName }}</p>
            <p class="truncate text-[12px] text-ink-muted">{{ [row.position, row.department].filter(Boolean).join(' · ') }}</p>
          </div>
          <span class="shrink-0 text-[12px]" :class="row.daysUntil === 0 ? 'font-semibold text-primary' : 'text-ink-muted'">{{ when(row) }}</span>
        </li>
      </ul>
    </div>
  </Drawer>
</template>

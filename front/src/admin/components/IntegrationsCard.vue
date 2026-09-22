<script setup>
/**
 * «Integratsiyalar» (the reference's «Сервисы», answered honestly): what
 * this installation is actually wired to. Every row says connected, not
 * connected, or nothing-to-connect, and where it is set — several are
 * server-side keys, which the row says rather than offering a switch that
 * could not work. No vendor offers: we sell nothing here.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { platformSettingsApi } from '@/services/platformSettings'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t } = useI18n()
const router = useRouter()
const rows = ref([])
const loading = ref(true)

const ICONS = {
  sso: 'shield',
  mail: 'send',
  push: 'bell',
  ai: 'sparkles',
  storage: 'layers',
  api: 'code',
  webhooks: 'link',
  meetings: 'video',
}

onMounted(async () => {
  try {
    rows.value = await platformSettingsApi.integrations()
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
})

const tone = {
  on: 'bg-success-subtle text-success',
  off: 'bg-surface-2 text-ink-muted',
  none: 'bg-surface-2 text-ink-faint',
}
</script>

<template>
  <div>
    <h2 class="text-[18px] font-medium text-ink">{{ t('integrations.title') }}</h2>
    <p class="mt-1 text-caption text-ink-faint">{{ t('integrations.hint') }}</p>

    <Skeleton v-if="loading" class="mt-4 h-48 w-full rounded-lg" />
    <ul v-else class="mt-4 divide-y divide-border border-t border-border">
      <li v-for="row in rows" :key="row.key" class="flex flex-wrap items-center gap-3 py-3.5">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-muted"><Icon :name="ICONS[row.key] ?? 'info'" size="18" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] text-ink">{{ t(`integrations.items.${row.key}.name`) }}</span>
          <span class="block text-[13px] text-ink-muted">{{ t(`integrations.items.${row.key}.text`) }}</span>
          <span v-if="row.detail && row.status === 'on'" class="block truncate font-mono text-[12px] text-ink-faint">{{ row.detail }}</span>
        </span>
        <span class="shrink-0 rounded-full px-3 py-1 text-[13px]" :class="tone[row.status]">{{ t(`integrations.status.${row.status}`) }}</span>
        <button
          v-if="row.link"
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-[13px] text-primary transition-default hover:bg-primary-subtle"
          @click="router.push(row.link)"
        >
          {{ t('integrations.open') }}
        </button>
        <span v-else class="shrink-0 text-[13px] text-ink-faint">{{ t('integrations.where.env') }}</span>
      </li>
    </ul>
  </div>
</template>

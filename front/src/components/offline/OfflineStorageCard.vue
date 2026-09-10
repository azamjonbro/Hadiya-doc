<script setup>
/**
 * What is on this device, and how to get rid of it (12.2).
 *
 * A feature that writes hundreds of megabytes to somebody's phone owes
 * them one screen that says how much, for what, and a button that clears
 * it. The browser's own estimate is shown next to it, because "3 courses"
 * means nothing without "of the 2 GB this site may use".
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import * as offline from '@/offline/offlineContent'
import { formatBytes } from '@/offline/offlinePlan'
import { storageEstimate } from '@/offline/db'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const supported = offline.isSupported()
const saved = ref([])
const estimate = ref({ usage: null, quota: null })
const loading = ref(true)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    saved.value = await offline.listSaved()
    estimate.value = await storageEstimate()
  } finally {
    loading.value = false
  }
}

async function remove(record) {
  if (!(await confirm.ask({ message: t('offline.confirmRemoveNamed', { title: record.title }) }))) return
  busy.value = true
  try {
    await offline.removeCourse(record.courseId)
    await load()
    toast.success(t('offline.removed'))
  } finally {
    busy.value = false
  }
}

async function removeAll() {
  if (!(await confirm.ask({ message: t('offline.confirmRemoveAll') }))) return
  busy.value = true
  try {
    await offline.removeAll()
    await load()
    toast.success(t('offline.removedAll'))
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppCard class="border border-border p-6 shadow-sm">
    <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('offline.storageTitle') }}</h2>
    <p class="mt-2 text-small text-ink-muted">{{ t('offline.storageHint') }}</p>

    <p v-if="!supported" class="mt-3 text-caption text-warning">{{ t('offline.unsupported') }}</p>
    <p v-else-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <p v-if="estimate.usage != null" class="mt-3 text-caption text-ink-muted">
        {{ t('offline.usage', {
          used: formatBytes(estimate.usage, locale),
          quota: estimate.quota != null ? formatBytes(estimate.quota, locale) : '—',
        }) }}
      </p>

      <p v-if="!saved.length" class="mt-3 text-caption text-ink-faint">{{ t('offline.nothingSaved') }}</p>

      <ul v-else class="mt-3 divide-y divide-border">
        <li v-for="record in saved" :key="record.courseId" class="flex flex-wrap items-center gap-2 py-2.5">
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            @click="router.push(`/courses/${record.courseId}`)"
          >
            <span class="block truncate text-small font-medium text-ink hover:underline">{{ record.title }}</span>
            <span class="block truncate text-caption text-ink-faint">
              {{ t('offline.savedItems', {
                lessons: record.lessons?.length ?? 0,
                materials: record.materials?.length ?? 0,
              }) }}
              · {{ formatBytes(record.bytes, locale) }}
              · {{ new Date(record.savedAt).toLocaleDateString(locale) }}
            </span>
          </button>
          <AppButton variant="ghost" size="sm" icon="trash-2" :loading="busy" @click="remove(record)">
            {{ t('offline.remove') }}
          </AppButton>
        </li>
      </ul>

      <AppButton v-if="saved.length > 1" class="mt-3" variant="secondary" size="sm" :loading="busy" @click="removeAll">
        {{ t('offline.removeAll') }}
      </AppButton>

      <p class="mt-3 flex items-start gap-1.5 text-caption text-ink-faint">
        <Icon name="alert-triangle" size="13" class="mt-0.5 shrink-0" />
        {{ t('offline.whatIsNotSaved') }}
      </p>
    </template>
  </AppCard>
</template>

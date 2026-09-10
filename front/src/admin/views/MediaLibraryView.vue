<script setup>
/**
 * The media library.
 *
 * Two jobs on one page. The grid is for authors: find the image you already
 * uploaded, see where it is used, rename it into something recognisable,
 * put it in a folder. The panel at the bottom is for whoever runs the
 * server: the orphan sweep, which is the only thing here that can delete
 * bytes nobody asked about, and therefore reports before it acts.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mediaApi } from '@/services/media'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const items = ref([])
const folders = ref([])
const total = ref(0)
const page = ref(1)
const limit = 40
const folder = ref('')
const search = ref('')
const loading = ref(true)
const errorMessage = ref('')

const selected = ref(null)
const usage = ref(null)
const usageLoading = ref(false)

const cleanup = ref(null)
const cleanupRunning = ref(false)
const isSuperAdmin = computed(() => auth.isSuperAdmin)

function formatSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [result, folderNames] = await Promise.all([
      mediaApi.list({
        page: page.value,
        limit,
        folder: folder.value || undefined,
        search: search.value || undefined,
      }),
      mediaApi.folders(),
    ])
    items.value = result.items
    total.value = result.total
    folders.value = folderNames
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('media.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function open(item) {
  selected.value = item
  usage.value = null
  usageLoading.value = true
  try {
    usage.value = await mediaApi.usage(item.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('media.usageFailed')))
  } finally {
    usageLoading.value = false
  }
}

async function save() {
  if (!selected.value) return
  try {
    const updated = await mediaApi.update(selected.value.id, {
      name: selected.value.name,
      folder: selected.value.folder ?? '',
    })
    selected.value = updated
    await load()
    toast.success(t('media.saved'))
  } catch (error) {
    toast.error(apiErrorText(error, t('media.saveFailed')))
  }
}

async function remove(item) {
  const uses = usage.value?.uses?.length ?? 0
  const message = uses ? t('media.confirmDeleteInUse', { count: uses }) : t('media.confirmDelete')
  if (!(await confirm.ask({ message }))) return
  try {
    // `force` only after the dialog has said out loud how many places
    // point at it — the guard is on the server, and this is the one place
    // that may knowingly override it.
    await mediaApi.remove(item.id, { force: uses > 0 })
    selected.value = null
    usage.value = null
    await load()
    toast.success(t('media.deleted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('media.deleteFailed')))
  }
}

async function runCleanup(apply) {
  if (apply && !(await confirm.ask({ message: t('media.confirmCleanup') }))) return
  cleanupRunning.value = true
  try {
    cleanup.value = await mediaApi.cleanup({ apply })
  } catch (error) {
    toast.error(apiErrorText(error, t('media.cleanupFailed')))
  } finally {
    cleanupRunning.value = false
  }
}

let debounce = null
watch(search, () => {
  if (debounce) window.clearTimeout(debounce)
  debounce = window.setTimeout(() => {
    page.value = 1
    load()
  }, 300)
})
watch([folder, page], load)
onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-[1440px] px-6 py-6">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div>
        <h1 class="text-h2 text-ink">{{ t('media.title') }}</h1>
        <p class="mt-0.5 text-small text-ink-muted">{{ t('media.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppInput v-model="search" class="w-56" :placeholder="t('media.search')" />
        <AppSelect
          v-model="folder"
          class="w-44"
          :options="[{ value: '', label: t('media.allFolders') }, ...folders.map((name) => ({ value: name, label: name }))]"
        />
      </div>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      <Skeleton v-for="index in 12" :key="index" class="aspect-square rounded-lg" />
    </div>

    <EmptyState v-else-if="!items.length" icon="image" class="mt-6" :title="t('media.empty')" />

    <div v-else class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="overflow-hidden rounded-lg border text-left transition-default"
        :class="selected?.id === item.id ? 'border-primary' : 'border-border hover:border-border-strong'"
        @click="open(item)"
      >
        <span class="block aspect-square bg-surface-2">
          <img :src="item.thumbUrl || item.url" :alt="item.name" class="h-full w-full object-cover" loading="lazy" />
        </span>
        <span class="block px-2 py-1.5">
          <span class="block truncate text-caption font-medium text-ink">{{ item.name || item.key.slice(-14) }}</span>
          <span class="block truncate text-caption text-ink-faint">
            {{ item.folder || t('media.noFolder') }} · {{ formatSize(item.size) }}
          </span>
        </span>
      </button>
    </div>

    <Pagination
      v-if="total > limit"
      class="mt-4"
      :page="page"
      :total-pages="Math.ceil(total / limit)"
      @update:page="(value) => (page = value)"
    />

    <!-- One selected file: what it is, where it is used, and the two things
         that can be done about it. -->
    <AppCard v-if="selected" class="mt-6">
      <div class="flex flex-wrap gap-4">
        <img :src="selected.url" :alt="selected.name" class="h-32 w-32 rounded-lg border border-border object-cover" />
        <div class="min-w-0 flex-1 space-y-2">
          <div class="flex flex-wrap gap-2">
            <AppInput v-model="selected.name" class="min-w-0 flex-1" :label="t('media.name')" />
            <AppInput v-model="selected.folder" class="w-48" :label="t('media.folder')" placeholder="brand/2026" />
          </div>
          <p class="text-caption text-ink-faint">
            {{ selected.mimeType }} · {{ formatSize(selected.size) }} ·
            {{ new Date(selected.createdAt).toLocaleDateString(locale) }}
          </p>

          <div>
            <p class="text-small font-medium text-ink">{{ t('media.usedIn') }}</p>
            <p v-if="usageLoading" class="text-caption text-ink-faint">{{ t('common.loading') }}</p>
            <p v-else-if="!usage?.uses?.length" class="text-caption text-ink-faint">{{ t('media.notUsed') }}</p>
            <ul v-else class="mt-1 space-y-0.5">
              <li v-for="(use, index) in usage.uses" :key="index" class="text-caption text-ink-muted">
                <Badge variant="neutral" size="sm">{{ use.entity }}</Badge>
                {{ use.label || use.entityId }} · <span class="text-ink-faint">{{ use.field }}</span>
              </li>
            </ul>
          </div>

          <div class="flex gap-2 pt-1">
            <AppButton size="sm" @click="save">{{ t('common.save') }}</AppButton>
            <AppButton variant="ghost" size="sm" icon="trash" @click="remove(selected)">
              {{ t('common.delete') }}
            </AppButton>
            <AppButton variant="ghost" size="sm" @click="selected = null">{{ t('courses.cancel') }}</AppButton>
          </div>
        </div>
      </div>
    </AppCard>

    <!-- The sweep. SUPERADMIN only, and it reports before it deletes. -->
    <AppCard v-if="isSuperAdmin" class="mt-6">
      <p class="text-small font-semibold text-ink">{{ t('media.cleanupTitle') }}</p>
      <p class="mt-0.5 text-caption text-ink-muted">{{ t('media.cleanupHint') }}</p>

      <div class="mt-3 flex flex-wrap gap-2">
        <AppButton variant="outline" size="sm" icon="search" :loading="cleanupRunning" @click="runCleanup(false)">
          {{ t('media.cleanupReport') }}
        </AppButton>
        <AppButton
          v-if="cleanup && cleanup.totalObjects"
          variant="ghost"
          size="sm"
          icon="trash"
          :loading="cleanupRunning"
          @click="runCleanup(true)"
        >
          {{ t('media.cleanupApply', { count: cleanup.totalObjects }) }}
        </AppButton>
      </div>

      <div v-if="cleanup" class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-small">
          <thead>
            <tr>
              <th class="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-ink">{{ t('media.area') }}</th>
              <th class="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-ink">{{ t('media.objects') }}</th>
              <th class="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-ink">{{ t('media.size') }}</th>
              <th class="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-ink">{{ t('media.sample') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(area, name) in cleanup.areas" :key="name">
              <td class="border border-border px-2 py-1 text-ink">{{ name }}</td>
              <td class="border border-border px-2 py-1 tabular-nums text-ink">{{ area.objects }}</td>
              <td class="border border-border px-2 py-1 tabular-nums text-ink">{{ formatSize(area.bytes) }}</td>
              <td class="border border-border px-2 py-1 text-caption text-ink-faint">
                {{ area.sample.join(', ') || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-caption text-ink-faint">
          {{ cleanup.applied ? t('media.cleanupDeleted', { count: cleanup.deleted }) : t('media.cleanupReportOnly', { days: cleanup.graceDays }) }}
        </p>
      </div>
    </AppCard>
  </div>
</template>

<script setup>
// Proctoring alerts for one learner on one video: what was seen, when, and
// the frame that was kept.
//
// The images are not public URLs. The proctor bucket has no anonymous policy
// and issues no signed links, so each thumbnail is fetched through the
// admin-only endpoint and shown from an object URL — which also means every
// view is an authenticated request the server records.
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ATTENTION_REASONS } from '@lms/shared'
import { proctorApi } from '@/services/proctor'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  videoId: { type: String, required: true },
  userId: { type: String, default: '' },
})

const { t, locale } = useI18n()
const items = ref([])
const loading = ref(false)
const objectUrls = ref({})

function reasonLabel(reason) {
  return reason === ATTENTION_REASONS.MULTIPLE_FACES ? t('proctor.multipleFaces') : t('proctor.unknownFace')
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString(locale.value) : '—'
}

async function load() {
  loading.value = true
  try {
    const params = { videoId: props.videoId, limit: 20 }
    if (props.userId) params.userId = props.userId
    const result = await proctorApi.list(params)
    items.value = result.items
    // Thumbnails are fetched one by one rather than in the list response —
    // a listing that inlined the images would move megabytes for a panel
    // most reviewers glance at and close.
    for (const item of result.items) loadImage(item.id)
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function loadImage(id) {
  if (objectUrls.value[id]) return
  try {
    objectUrls.value = { ...objectUrls.value, [id]: await proctorApi.imageObjectUrl(id) }
  } catch {
    /* a missing image should not blank the row it belongs to */
  }
}

async function markReviewed(item) {
  const updated = await proctorApi.markReviewed(item.id)
  items.value = items.value.map((i) => (i.id === item.id ? { ...i, reviewedAt: updated.reviewedAt } : i))
}

// Object URLs are retained by the document until they are revoked, so a
// reviewer who opens several learners in a row would otherwise accumulate
// every frame they had looked at for as long as the tab stayed open.
function releaseUrls() {
  for (const url of Object.values(objectUrls.value)) URL.revokeObjectURL(url)
  objectUrls.value = {}
}

watch(() => [props.videoId, props.userId], () => {
  releaseUrls()
  load()
}, { immediate: true })

onBeforeUnmount(releaseUrls)
</script>

<template>
  <AppCard>
    <div class="flex items-center justify-between">
      <h2 class="text-small font-semibold text-ink">{{ t('proctor.title') }}</h2>
      <Badge v-if="items.length" variant="warning" size="sm">{{ items.length }}</Badge>
    </div>

    <p v-if="!loading && !items.length" class="mt-3 text-small text-ink-faint">{{ t('proctor.empty') }}</p>

    <ul v-else class="mt-3 space-y-3">
      <li v-for="item in items" :key="item.id" class="flex gap-3 rounded-md border border-border p-2">
        <img
          v-if="objectUrls[item.id]"
          :src="objectUrls[item.id]"
          class="h-20 w-28 shrink-0 rounded object-cover"
          alt=""
        />
        <div v-else class="flex h-20 w-28 shrink-0 items-center justify-center rounded bg-surface-2">
          <Icon name="image" size="18" class="text-ink-faint" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-small font-medium text-ink">{{ reasonLabel(item.reason) }}</p>
          <p class="mt-0.5 text-caption text-ink-faint">
            {{ t('proctor.capturedAt') }}: {{ formatDate(item.capturedAt) }}
            <template v-if="item.faceCount"> · {{ t('proctor.faces', { count: item.faceCount }) }}</template>
          </p>
          <p v-if="item.user" class="truncate text-caption text-ink-faint">{{ item.user.fullName }}</p>

          <div class="mt-1.5">
            <Badge v-if="item.reviewedAt" variant="success" size="sm">{{ t('proctor.reviewed') }}</Badge>
            <AppButton v-else size="sm" variant="ghost" @click="markReviewed(item)">
              {{ t('proctor.review') }}
            </AppButton>
          </div>
        </div>
      </li>
    </ul>
  </AppCard>
</template>

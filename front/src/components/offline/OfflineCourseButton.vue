<script setup>
/**
 * "Save this course offline" (12.2).
 *
 * Deliberately says what it will cost **before** downloading, and what it
 * will not take: video, tests and SCORM stay online, and somebody who
 * expected their video to be there would otherwise find that out in a
 * corridor with no signal.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOfflineCourse } from '@/composables/useOfflineCourse'
import { formatBytes } from '@/offline/offlinePlan'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ courseId: { type: String, required: true } })

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const offline = useOfflineCourse(props.courseId)
const asking = ref(false)

onMounted(offline.refresh)

async function ask() {
  asking.value = true
  try {
    await offline.preview()
  } catch {
    toast.error(t('offline.planFailed'))
    asking.value = false
  }
}

async function confirmSave() {
  try {
    await offline.save()
    asking.value = false
    toast.success(t('offline.saved'))
  } catch {
    toast.error(t(`offline.errors.${offline.error.value}`, t('offline.errors.SAVE_FAILED')))
  }
}

async function remove() {
  if (!(await confirm.ask({ message: t('offline.confirmRemove') }))) return
  await offline.remove()
  toast.success(t('offline.removed'))
}
</script>

<template>
  <div v-if="offline.supported" class="text-small">
    <!-- Saved: size, and the way out. -->
    <div v-if="offline.saved.value" class="flex flex-wrap items-center gap-2">
      <span class="flex items-center gap-1.5 text-success">
        <Icon name="check" size="14" />
        {{ t('offline.savedLabel', { size: offline.sizeText.value }) }}
      </span>
      <AppButton variant="ghost" size="sm" :loading="offline.busy.value" @click="remove">
        {{ t('offline.remove') }}
      </AppButton>
    </div>

    <!-- Downloading: what it is on right now, so a long download is not a
         spinner somebody has to trust. -->
    <div v-else-if="offline.busy.value" class="flex flex-wrap items-center gap-2 text-ink-muted">
      <Icon name="loader" size="14" class="animate-spin" />
      {{ t('offline.saving', { done: offline.progress.value.done, total: offline.progress.value.total }) }}
      <span class="truncate text-caption text-ink-faint">{{ offline.progress.value.title }}</span>
    </div>

    <!-- The plan, before anything is downloaded. -->
    <div v-else-if="asking && offline.plan.value" class="rounded-lg border border-border bg-surface-2 p-3">
      <p class="text-small text-ink">
        {{ t('offline.planSummary', {
          items: offline.plan.value.itemCount,
          size: formatBytes(offline.plan.value.estimatedBytes, locale),
        }) }}
      </p>
      <p class="mt-1 text-caption text-ink-muted">{{ t('offline.whatIsNotSaved') }}</p>
      <ul v-if="offline.plan.value.skipped.length" class="mt-1 space-y-0.5">
        <li v-for="item in offline.plan.value.skipped" :key="item.id" class="text-caption text-warning">
          {{ t('offline.skippedTooLarge', { title: item.title, size: formatBytes(item.sizeBytes, locale) }) }}
        </li>
      </ul>
      <p v-if="!offline.plan.value.fits.ok" class="mt-2 text-caption text-danger">
        {{ t(`offline.errors.${offline.plan.value.fits.reason}`) }}
      </p>
      <div class="mt-3 flex gap-2">
        <AppButton
          size="sm"
          icon="download"
          :disabled="!offline.plan.value.fits.ok || !offline.plan.value.itemCount"
          @click="confirmSave"
        >
          {{ t('offline.download') }}
        </AppButton>
        <AppButton variant="ghost" size="sm" @click="asking = false">{{ t('common.cancel') }}</AppButton>
      </div>
    </div>

    <AppButton v-else variant="secondary" size="sm" icon="download" @click="ask">
      {{ t('offline.save') }}
    </AppButton>
  </div>
</template>

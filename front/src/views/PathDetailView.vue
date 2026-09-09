<script setup>
/**
 * One programme, step by step.
 *
 * The lock state comes from the server (pathSequence.js), so a locked step
 * is greyed here for the same reason it is refused there — the difference
 * being that this way somebody sees *why* rather than clicking through to
 * a 403.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const path = ref(null)
const loading = ref(true)
const joining = ref(false)

const nextStep = computed(() =>
  path.value?.items.find((item) => !item.completed && !item.locked && !item.missing) ?? null
)

async function load() {
  loading.value = true
  try {
    path.value = await pathsApi.getById(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function join() {
  joining.value = true
  try {
    path.value = await pathsApi.enroll(route.params.id)
    toast.success(t('paths.joined'))
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.joinError')))
  } finally {
    joining.value = false
  }
}

function open(item) {
  if (item.locked || item.missing) return
  router.push(`/courses/${item.refId}`)
}

function blockedTitle(item) {
  const blocker = path.value.items.find((entry) => entry.refId === item.blockedBy)
  return blocker?.title ?? ''
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small text-ink-muted hover:text-ink" @click="router.push('/paths')">
      <Icon name="chevron-left" size="16" />
      {{ t('paths.title') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-xl" />
    </div>

    <template v-else-if="path">
      <h1 class="mt-4 text-h1 text-ink">{{ path.title }}</h1>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="neutral" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
        <Badge v-if="path.sequential" variant="info" size="sm">{{ t('paths.sequential') }}</Badge>
        <span class="text-caption text-ink-faint">{{ t('paths.stepCount', { count: path.totalRequired }) }}</span>
      </div>
      <p v-if="path.description" class="mt-3 text-small text-ink-muted">{{ path.description }}</p>

      <AppCard v-if="path.enrollment" class="mt-6 p-5">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-small font-medium text-ink">
              {{ path.enrollment.status === 'COMPLETED' ? t('paths.completed') : t('paths.inProgress') }}
            </p>
            <p class="mt-0.5 text-caption text-ink-faint">
              {{ t('paths.requiredDone', { done: path.completedRequired, total: path.totalRequired }) }}
            </p>
          </div>
          <AppButton v-if="nextStep" @click="open(nextStep)">{{ t('paths.continue') }}</AppButton>
        </div>
        <ProgressBar class="mt-3" :value="path.completionPercent" :variant="path.complete ? 'success' : 'primary'" />
      </AppCard>

      <AppCard v-else class="mt-6 flex items-center justify-between gap-4 p-5">
        <p class="text-small text-ink-muted">{{ t('paths.notEnrolled') }}</p>
        <AppButton :loading="joining" @click="join">{{ t('paths.join') }}</AppButton>
      </AppCard>

      <div class="mt-6 space-y-2">
        <div
          v-for="(item, index) in path.items"
          :key="item.id"
          class="flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-default"
          :class="[
            item.locked || item.missing ? 'border-border bg-surface-2/50' : 'cursor-pointer border-border hover:bg-surface-hover',
          ]"
          @click="open(item)"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-small font-semibold"
            :class="item.completed ? 'bg-success-subtle text-success' : item.locked ? 'bg-surface-2 text-ink-faint' : 'bg-primary-subtle text-primary'"
          >
            <Icon v-if="item.completed" name="check" size="15" />
            <Icon v-else-if="item.locked" name="lock" size="14" />
            <span v-else>{{ index + 1 }}</span>
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-small font-medium" :class="item.locked ? 'text-ink-muted' : 'text-ink'">
              {{ item.title ?? t('paths.missingCourse') }}
            </p>
            <p class="mt-0.5 text-caption text-ink-faint">
              <template v-if="item.missing">{{ t('paths.missingHint') }}</template>
              <template v-else-if="item.locked && blockedTitle(item)">
                {{ t('paths.blockedBy', { title: blockedTitle(item) }) }}
              </template>
              <template v-else-if="!item.required">{{ t('paths.optional') }}</template>
              <template v-else-if="item.estimatedMinutes">{{ t('courses.minutes', { count: item.estimatedMinutes }) }}</template>
            </p>
          </div>

          <Badge v-if="!item.required" variant="neutral" size="sm">{{ t('paths.optional') }}</Badge>
          <Icon v-else-if="!item.locked && !item.missing" name="chevron-right" size="16" class="shrink-0 text-ink-faint" />
        </div>
      </div>
    </template>
  </div>
</template>

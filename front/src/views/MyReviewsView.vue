<script setup>
/**
 * The rater's inbox.
 *
 * Pending and answered come from two separate requests rather than one
 * `status=ALL` that the screen then splits. The server hides a PENDING row
 * whose cycle has been closed — it cannot be answered any more, so it is not
 * waiting on anybody — and re-deriving that rule in the browser would mean
 * the inbox and the questionnaire disagree about what is still open.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { review360Api } from '@/services/review360'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDate } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()

const tab = ref('pending')
const pending = ref([])
const answered = ref([])
const loading = ref(true)

const rows = computed(() => (tab.value === 'pending' ? pending.value : answered.value))

function isOverdue(row) {
  return Boolean(row.dueAt) && new Date(row.dueAt).getTime() < Date.now()
}

function openAssignment(row) {
  router.push({ name: 'review360-respond', params: { assignmentId: row.id } })
}

async function load() {
  loading.value = true
  try {
    const [pendingRows, answeredRows] = await Promise.all([
      review360Api.mine({ status: 'PENDING' }),
      review360Api.mine({ status: 'SUBMITTED' }),
    ])
    pending.value = pendingRows
    answered.value = answeredRows
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.loadError')))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('review360.mine') }}</h1>
    <p class="mt-1 text-small text-ink-muted">{{ t('review360.mineSubtitle') }}</p>

    <Tabs
      v-model="tab"
      class="mt-5"
      :tabs="[
        { value: 'pending', label: t('review360.minePending'), count: pending.length },
        { value: 'answered', label: t('review360.mineAnswered'), count: answered.length },
      ]"
    />

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-lg" />
    </div>

    <EmptyState
      v-else-if="!rows.length"
      class="mt-6"
      icon="check-circle"
      :title="tab === 'pending' ? t('review360.mineEmptyPending') : t('review360.mineEmptyAnswered')"
      :description="tab === 'pending' ? t('review360.mineEmptyPendingHint') : ''"
    />

    <div v-else class="mt-4 space-y-3">
      <AppCard v-for="row in rows" :key="row.id" class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <Avatar :name="row.subjectName" :src="row.subjectAvatar" size="md" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate font-medium text-ink">{{ row.subjectName }}</p>
                <span v-if="row.subjectPosition" class="text-caption text-ink-faint">{{ row.subjectPosition }}</span>
                <Badge variant="info" size="sm">{{ t(`review360.group.${row.raterGroup}`) }}</Badge>
              </div>
              <p class="mt-0.5 truncate text-small text-ink-muted">{{ row.cycleName }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                <span v-if="row.status === 'SUBMITTED'" class="text-ink-faint">
                  <Icon name="check" size="11" class="mr-1 inline" />
                  {{ t('review360.mineSubmittedAt', { date: formatDate(row.submittedAt, locale) }) }}
                </span>
                <template v-else>
                  <span :class="isOverdue(row) ? 'text-danger' : 'text-ink-faint'">
                    <Icon name="clock" size="11" class="mr-1 inline" />
                    {{ row.dueAt ? t('review360.mineDue', { date: formatDate(row.dueAt, locale) }) : t('review360.noDue') }}
                  </span>
                  <Badge v-if="isOverdue(row)" variant="danger" size="sm">{{ t('review360.mineOverdue') }}</Badge>
                </template>
              </p>
            </div>
          </div>

          <AppButton
            :variant="row.status === 'SUBMITTED' ? 'secondary' : 'primary'"
            size="sm"
            icon="arrow-right"
            icon-position="right"
            @click="openAssignment(row)"
          >
            {{ row.status === 'SUBMITTED' ? t('review360.viewAnswers') : t('review360.answerNow') }}
          </AppButton>
        </div>
      </AppCard>
    </div>
  </div>
</template>

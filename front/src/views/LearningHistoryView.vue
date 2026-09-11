<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { apiErrorText } from '@/utils/apiError'
import { formatHms } from '@/utils/format'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import AppButton from '@/components/ui/AppButton.vue'

/**
 * The learner's own history (portal §11): a 900px table, one course per
 * row with its items indented under it. Rows open on click rather than all
 * at once — forty courses with six items each is a wall, and the question
 * this page answers is usually about one course.
 */
const PAGE_SIZE = 25

const { t, locale } = useI18n()
const auth = useAuthStore()

const page = ref(1)
const data = ref(null)
const error = ref('')
const expanded = ref(new Set())

const rangeLabel = computed(() => {
  if (!data.value?.total) return ''
  const from = (data.value.page - 1) * data.value.limit + 1
  const to = Math.min(data.value.total, from + data.value.items.length - 1)
  return `${from}–${to} / ${data.value.total}`
})

async function load() {
  data.value = null
  error.value = ''
  try {
    data.value = await usersApi.learningHistory(auth.user.id, { page: page.value, limit: PAGE_SIZE })
    // The first row opens by itself so the page does not look like a list
    // of course names; the rest stay closed.
    expanded.value = new Set(data.value.items.slice(0, 1).map((row) => row.courseId))
  } catch (e) {
    error.value = apiErrorText(e, t('portal.history.loadError'))
  }
}

function toggle(courseId) {
  const next = new Set(expanded.value)
  if (next.has(courseId)) next.delete(courseId)
  else next.add(courseId)
  expanded.value = next
}

function formatWhen(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale.value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// The status colours the reference uses: grey for underway, green when
// done, red when the deadline passed or the last test attempt failed,
// nothing for untouched.
const STATUS_CLASS = {
  IN_PROGRESS: 'text-ink-muted',
  COMPLETED: 'text-success',
  FAILED: 'text-danger',
  NOT_STARTED: 'text-ink-faint',
}

const KIND_ICON = {
  video: { name: 'video', class: 'text-sky-600' },
  material: { name: 'file-text', class: 'text-amber-600' },
  lesson: { name: 'book-open', class: 'text-violet-600' },
  scorm: { name: 'layers', class: 'text-teal-600' },
  assessment: { name: 'check-square', class: 'text-rose-600' },
}

function score(row) {
  return row.scorePercent == null ? '—' : `${row.scorePercent} %`
}

watch(page, load)
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-surface pb-16">
    <div class="mx-auto w-full max-w-[900px] px-4 pt-10">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-[24px] font-bold text-ink">{{ t('portal.history.title') }}</h1>
          <p class="mt-1 text-[13px] text-ink-muted">{{ t('portal.history.intro') }}</p>
        </div>
        <div v-if="data?.total" class="flex items-center gap-2 text-[13px] text-ink-muted">
          <span>{{ rangeLabel }}</span>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md transition-default hover:bg-surface-2 disabled:opacity-40"
            :disabled="page === 1"
            :aria-label="t('a11y.previousPage')"
            @click="page -= 1"
          >
            <Icon name="chevron-left" size="16" />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md transition-default hover:bg-surface-2 disabled:opacity-40"
            :disabled="page >= data.totalPages"
            :aria-label="t('a11y.nextPage')"
            @click="page += 1"
          >
            <Icon name="chevron-right" size="16" />
          </button>
        </div>
      </div>

      <div class="mt-6 rounded-lg border border-border bg-surface shadow-sm">
        <Skeleton v-if="!data && !error" class="m-4 h-64 rounded-lg" />
        <ErrorState v-else-if="error" :title="error">
          <template #actions>
            <AppButton variant="secondary" @click="load">{{ t('common.retry') }}</AppButton>
          </template>
        </ErrorState>
        <EmptyState
          v-else-if="!data.items.length"
          icon="clock"
          :title="t('portal.history.emptyTitle')"
          :description="t('portal.history.emptyBody')"
        />
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr class="h-10 border-b border-border text-left text-ink-muted">
                <th class="w-[150px] pl-4 pr-2 font-medium">
                  <span class="inline-flex items-center gap-1">{{ t('portal.history.date') }}<Icon name="chevron-down" size="12" /></span>
                </th>
                <th class="px-2 font-medium">{{ t('portal.history.materials') }}</th>
                <th class="w-[130px] px-2 font-medium">{{ t('portal.history.status') }}</th>
                <th class="w-[90px] px-2 text-right font-medium">{{ t('portal.history.viewed') }}</th>
                <th class="w-[90px] px-2 text-right font-medium">{{ t('portal.history.score') }}</th>
                <th class="w-[110px] pl-2 pr-4 text-right font-medium">{{ t('portal.history.time') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in data.items" :key="row.courseId">
                <tr
                  class="h-9 cursor-pointer border-b border-border transition-default hover:bg-surface-2/60"
                  :aria-expanded="expanded.has(row.courseId)"
                  @click="toggle(row.courseId)"
                >
                  <td class="whitespace-nowrap pl-4 pr-2 text-ink-muted">{{ formatWhen(row.lastActivityAt) }}</td>
                  <td class="px-2">
                    <span class="flex items-center gap-2">
                      <Icon
                        :name="expanded.has(row.courseId) ? 'chevron-down' : 'chevron-right'"
                        size="14"
                        class="shrink-0 text-ink-faint"
                      />
                      <Icon name="graduation-cap" size="16" class="shrink-0 text-primary" />
                      <RouterLink
                        :to="{ name: 'course-detail', params: { id: row.courseId } }"
                        class="truncate font-medium text-ink hover:text-primary"
                        @click.stop
                      >
                        {{ row.title }}
                      </RouterLink>
                    </span>
                  </td>
                  <td class="px-2 font-medium" :class="STATUS_CLASS[row.status]">{{ t(`portal.history.statuses.${row.status}`) }}</td>
                  <td class="px-2 text-right tabular-nums text-ink">{{ row.completionPercent }} %</td>
                  <td class="px-2 text-right tabular-nums text-ink">{{ score(row) }}</td>
                  <td class="pl-2 pr-4 text-right tabular-nums text-ink">{{ formatHms(row.timeSeconds) }}</td>
                </tr>
                <template v-if="expanded.has(row.courseId)">
                  <tr v-for="item in row.items" :key="item.id" class="h-9 border-b border-border last:border-b-0">
                    <td class="whitespace-nowrap pl-4 pr-2 text-ink-muted">{{ formatWhen(item.lastActivityAt) }}</td>
                    <td class="px-2">
                      <!-- The tree line: a vertical rule under the course's
                           chevron, a short tick out to each item -->
                      <span class="flex items-center gap-2 pl-[6px]">
                        <span class="relative h-9 w-4 shrink-0" aria-hidden="true">
                          <span class="absolute left-0 top-0 h-full w-px bg-border"></span>
                          <span class="absolute left-0 top-1/2 h-px w-3 bg-border"></span>
                        </span>
                        <Icon :name="KIND_ICON[item.kind]?.name ?? 'file-text'" size="16" class="shrink-0" :class="KIND_ICON[item.kind]?.class" />
                        <span class="truncate text-ink">{{ item.title }}</span>
                      </span>
                    </td>
                    <td class="px-2" :class="STATUS_CLASS[item.status]">{{ t(`portal.history.statuses.${item.status}`) }}</td>
                    <td class="px-2 text-right tabular-nums text-ink-muted">{{ item.completionPercent }} %</td>
                    <td class="px-2 text-right tabular-nums text-ink-muted">{{ score(item) }}</td>
                    <td class="pl-2 pr-4 text-right tabular-nums text-ink-muted">{{ item.timeSeconds ? formatHms(item.timeSeconds) : '—' }}</td>
                  </tr>
                  <tr v-if="!row.items.length" class="border-b border-border">
                    <td colspan="6" class="py-3 pl-12 text-ink-faint">{{ t('portal.history.noItems') }}</td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>
      </div>
      <p class="mt-3 text-[12px] text-ink-faint">{{ t('portal.history.timeNote') }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * Questions by course (rasn 20): a list of courses on the left with a
 * green badge of unanswered questions, the chosen course's questions on
 * the right — the same panel the course page shows, with the answer box.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { courseQuestionsApi } from '@/services/courseQuestions'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AppInput from '@/components/ui/AppInput.vue'
import QAPanel from '@/components/QAPanel.vue'

const { t } = useI18n()
const rows = ref(null)
const error = ref('')
const search = ref('')
const selected = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (rows.value ?? []).filter((row) => !q || row.title.toLowerCase().includes(q))
})
const current = computed(() => rows.value?.find((row) => row.courseId === selected.value) ?? null)

onMounted(async () => {
  try {
    rows.value = await courseQuestionsApi.summary()
  } catch (e) {
    error.value = apiErrorText(e)
    rows.value = []
  }
})
</script>

<template>
  <div class="px-6 py-6 lg:px-8">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('admin.qa.title') }}</h1>

    <div class="mt-5 grid min-h-[600px] grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <!-- Course list -->
      <div class="rounded-xl border border-border">
        <div class="p-3">
          <AppInput v-model="search" icon="search" :placeholder="t('common.search')" />
        </div>
        <div v-if="!rows" class="space-y-2 p-3"><Skeleton v-for="n in 6" :key="n" class="h-12 rounded-lg" /></div>
        <p v-else-if="error" class="p-4 text-small text-danger">{{ error }}</p>
        <p v-else-if="!filtered.length" class="p-6 text-center text-small text-ink-muted">{{ t('admin.qa.empty') }}</p>
        <ul v-else class="max-h-[70vh] divide-y divide-border overflow-y-auto">
          <li v-for="row in filtered" :key="row.courseId">
            <button
              type="button"
              class="flex h-14 w-full items-center gap-3 px-4 text-left transition-default hover:bg-surface-2"
              :class="selected === row.courseId ? 'bg-surface-2' : ''"
              :aria-current="selected === row.courseId ? 'true' : undefined"
              @click="selected = row.courseId"
            >
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"><Icon name="layers" size="15" /></span>
              <span class="min-w-0 flex-1 truncate text-[14px] text-ink">{{ row.title }}</span>
              <span
                class="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold"
                :class="row.unanswered ? 'bg-primary text-primary-foreground' : 'bg-surface-hover text-ink-muted'"
                :title="t('admin.qa.unanswered')"
              >{{ row.unanswered || row.total }}</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- Questions of the chosen course -->
      <div class="rounded-xl border border-border p-5">
        <template v-if="current">
          <h2 class="text-[18px] font-medium text-ink">{{ current.title }}</h2>
          <p class="mt-0.5 text-caption text-ink-muted">{{ t('admin.qa.counts', { total: current.total, unanswered: current.unanswered }) }}</p>
          <div class="mt-4"><QAPanel :key="current.courseId" :course-id="current.courseId" /></div>
        </template>
        <EmptyState v-else icon="message-square" :title="t('admin.qa.pick')" class="h-full" />
      </div>
    </div>
  </div>
</template>

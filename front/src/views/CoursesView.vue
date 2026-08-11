<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'

const { t } = useI18n()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const assignments = ref([])
const catalog = ref([])

function badgeClass(assignment) {
  if (assignment.isExpired) return 'text-red-500'
  if (assignment.isOverdue) return 'text-amber-500'
  return 'text-emerald-500'
}

function badgeLabel(assignment) {
  if (assignment.isExpired) return t('courses.badges.expired')
  if (assignment.isOverdue) return t('courses.badges.overdue')
  return t('courses.badges.onTrack')
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [myAssignments, catalogResult] = await Promise.all([
      coursesApi.myAssignments(auth.user.id),
      coursesApi.list({}),
    ])

    const courses = await Promise.all(myAssignments.map((a) => coursesApi.getById(a.courseId)))
    assignments.value = myAssignments.map((a, i) => ({ ...a, course: courses[i] }))
    catalog.value = catalogResult.items
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('courses.title') }}</h1>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <template v-else>
      <section class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('courses.assignedToYou') }}</h2>
        <ul class="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <li
            v-for="a in assignments"
            :key="a.id"
            class="cursor-pointer p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
            @click="$router.push(`/courses/${a.courseId}`)"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">{{ a.course?.title }}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {{ a.mandatory ? t('courses.mandatory') : t('courses.optional') }}
                  <template v-if="a.deadline"> · {{ t('courses.deadline') }}: {{ new Date(a.deadline).toLocaleDateString() }}</template>
                </p>
              </div>
              <span class="text-sm font-medium" :class="badgeClass(a)">{{ badgeLabel(a) }}</span>
            </div>
          </li>
          <li v-if="assignments.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ t('courses.noAssignments') }}
          </li>
        </ul>
      </section>

      <section class="mt-10">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('courses.catalog') }}</h2>
        <ul class="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <li
            v-for="course in catalog"
            :key="course.id"
            class="cursor-pointer p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
            @click="$router.push(`/courses/${course.id}`)"
          >
            {{ course.title }}
          </li>
          <li v-if="catalog.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ t('courses.empty') }}
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

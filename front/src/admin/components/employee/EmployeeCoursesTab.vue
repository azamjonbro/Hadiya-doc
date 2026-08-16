<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { coursesApi } from '@/services/courses'
import { formatDate } from '@/utils/format'
import EmployeeCourseProgress from '@/admin/components/EmployeeCourseProgress.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import TabError from './TabError.vue'

const props = defineProps({
  userId: { type: String, required: true },
})

const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const assignments = ref([])
const expandedCourseId = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    // GET /users/:id/courses — the admin-side endpoint for someone else's
    // assignments. (The old call here was coursesApi.myAssignments, which
    // only exists in the employee app, so this panel always rendered empty.)
    const rows = await usersApi.getCourses(props.userId)
    const courses = await Promise.all(rows.map((row) => coursesApi.getById(row.courseId)))
    assignments.value = rows.map((row, index) => ({ ...row, course: courses[index] }))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
    assignments.value = []
  } finally {
    loading.value = false
  }
}

function assignmentTone(assignment) {
  if (assignment.isExpired) return 'danger'
  if (assignment.status === 'COMPLETED') return 'success'
  if (assignment.isOverdue) return 'warning'
  return 'primary'
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-14 w-full" />
    </div>

    <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <EmptyState
      v-else-if="!assignments.length"
      icon="graduation-cap"
      :title="t('courses.empty')"
      :description="t('employee.courses.emptyHint')"
    />

    <div v-else class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      <div v-for="assignment in assignments" :key="assignment.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left transition-default hover:bg-surface-2"
          @click="expandedCourseId = expandedCourseId === assignment.courseId ? null : assignment.courseId"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-small font-medium text-ink">{{ assignment.course?.title }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <Badge :variant="assignmentTone(assignment)" size="sm">
                {{ assignment.isExpired ? t('employee.courses.expired') : t(`employee.courses.status.${assignment.status}`) }}
              </Badge>
              <span v-if="assignment.mandatory" class="text-caption text-ink-faint">{{ t('employee.courses.mandatory') }}</span>
              <span v-if="assignment.deadline" class="text-caption text-ink-faint">
                {{ t('tasks.deadline') }}: {{ formatDate(assignment.deadline, locale) }}
              </span>
            </div>
          </div>
          <Icon
            :name="expandedCourseId === assignment.courseId ? 'chevron-up' : 'chevron-down'"
            size="15"
            class="shrink-0 text-ink-faint"
          />
        </button>

        <EmployeeCourseProgress
          v-if="expandedCourseId === assignment.courseId"
          :course-id="assignment.courseId"
          :user-id="userId"
        />
      </div>
    </div>
  </div>
</template>

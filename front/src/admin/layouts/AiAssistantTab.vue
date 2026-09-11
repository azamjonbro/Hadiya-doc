<script setup>
/**
 * The "AI-помощник" tab on the right edge (rasn 1–27): a vertical pill
 * that opens a drawer. Our assistant answers within a course (10.x — it
 * only reads what the person may read), so the drawer starts with a
 * course picker and then shows the same chat the course page has.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import Drawer from '@/components/ui/Drawer.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Icon from '@/components/ui/Icon.vue'
import AiChatPanel from '@/components/AiChatPanel.vue'

const { t } = useI18n()
const open = ref(false)
const courses = ref([])
const courseId = ref('')

onMounted(async () => {
  try {
    const result = await coursesApi.list({ page: 1, limit: 50, status: 'PUBLISHED' })
    courses.value = result.items.map((course) => ({ value: course.id, label: course.title }))
  } catch {
    courses.value = []
  }
})
</script>

<template>
  <button
    type="button"
    class="fixed right-0 top-[62%] z-30 hidden -translate-y-1/2 rounded-l-xl border border-r-0 border-border bg-surface px-2 py-4 text-[13px] text-ink shadow-md transition-default hover:bg-surface-2 lg:block"
    :aria-expanded="open"
    @click="open = true"
  >
    <span class="flex items-center gap-2" style="writing-mode: vertical-rl; transform: rotate(180deg)">
      <Icon name="sparkles" size="16" class="text-violet-500" style="transform: rotate(180deg)" />
      {{ t('aiChat.title') }}
    </span>
  </button>

  <Drawer v-model="open" :title="t('aiChat.title')" width="max-w-[480px]">
    <p class="text-small text-ink-muted">{{ t('aiChat.subtitle') }}</p>
    <div class="mt-3">
      <AppSelect v-model="courseId" :placeholder="t('courses.title')" :options="courses" />
    </div>
    <div class="mt-4">
      <AiChatPanel v-if="courseId" :key="courseId" :course-id="courseId" />
      <p v-else class="rounded-lg bg-surface-2 p-4 text-small text-ink-muted">{{ t('admin.help.pickCourse') }}</p>
    </div>
  </Drawer>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

defineProps({
  rows: { type: Array, required: true },
  // Department is redundant inside a single-department group view.
  showDepartment: { type: Boolean, default: true },
})

const { t } = useI18n()
const router = useRouter()

// Only the podium gets a medal tone; past third place a plain number reads
// faster than a wall of coloured chips.
const MEDAL_CLASSES = {
  1: 'bg-warning-subtle text-warning',
  2: 'bg-surface-2 text-ink-muted',
  3: 'bg-danger-subtle text-danger',
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full min-w-[40rem] text-left">
      <thead>
        <tr class="border-b border-border text-caption uppercase tracking-wide text-ink-faint">
          <th class="w-16 px-4 py-2.5 font-medium">{{ t('leaderboard.rank') }}</th>
          <th class="px-4 py-2.5 font-medium">{{ t('leaderboard.employee') }}</th>
          <th v-if="showDepartment" class="px-4 py-2.5 font-medium">{{ t('users.fields.department') }}</th>
          <th class="px-4 py-2.5 text-right font-medium">{{ t('leaderboard.videos') }}</th>
          <th class="px-4 py-2.5 text-right font-medium">{{ t('leaderboard.quizzes') }}</th>
          <th class="px-4 py-2.5 text-right font-medium">{{ t('leaderboard.points') }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr
          v-for="row in rows"
          :key="row.userId"
          class="cursor-pointer transition-default hover:bg-surface-2"
          @click="router.push(`/bos/users/${row.userId}`)"
        >
          <td class="px-4 py-3">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full text-caption font-semibold"
              :class="MEDAL_CLASSES[row.rank] ?? 'text-ink-faint'"
            >
              <Icon v-if="row.rank === 1" name="award" size="14" />
              <template v-else>{{ row.rank }}</template>
            </span>
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2.5">
              <Avatar :name="row.fullName" :src="row.avatar" size="xs" />
              <div class="min-w-0">
                <p class="truncate text-small font-medium text-ink">{{ row.fullName }}</p>
                <p v-if="row.position" class="truncate text-caption text-ink-faint">{{ row.position }}</p>
              </div>
            </div>
          </td>
          <td v-if="showDepartment" class="px-4 py-3 text-caption text-ink-muted">{{ row.department || '—' }}</td>
          <td class="px-4 py-3 text-right text-caption text-ink-muted">{{ row.videosCompleted }}</td>
          <td class="px-4 py-3 text-right text-caption text-ink-muted">{{ row.quizzesPassed + row.assessmentsPassed }}</td>
          <td class="px-4 py-3 text-right">
            <Badge :variant="row.totalPoints > 0 ? 'primary' : 'neutral'" size="sm">{{ row.totalPoints }}</Badge>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="showDepartment ? 6 : 5" class="px-4 py-8 text-center text-small text-ink-faint">
            {{ t('leaderboard.empty') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

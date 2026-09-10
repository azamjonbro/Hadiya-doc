<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { coursesApi } from '@/services/courses'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

// The two destructive course actions plus their confirmations, kept in one
// component so the courses list and the course detail page can't drift apart
// on what "delete" means or on how hard it is to trigger by accident.
const props = defineProps({
  course: { type: Object, required: true },
  // 'icons' — bare icon buttons, for the hover row on a course card.
  // 'buttons' — full labelled buttons, for the detail page toolbar.
  layout: { type: String, default: 'buttons' },
  // Only meaningful for the 'buttons' layout; matches the neighbouring
  // buttons wherever this is dropped in.
  size: { type: String, default: 'md' },
})

const emit = defineEmits(['archived', 'deleted'])

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToast()

// Both steps are reversible now — archiving retires the course, deleting
// moves it to the trash — so both ride on the ordinary permission. Emptying
// the trash is the SUPERADMIN-only step, and it lives on the trash page.
const canArchive = computed(() => auth.hasPermission('course:delete') && props.course.status !== 'ARCHIVED')
const canDelete = computed(() => auth.hasPermission('course:delete'))

const showArchive = ref(false)
const archiving = ref(false)

const showDelete = ref(false)
const deleting = ref(false)
const titleConfirmation = ref('')

// Typing the course title back is the guard against a mis-click here — a
// plain "are you sure?" is too easy to click through for something that
// takes topics, videos and every employee's progress with it.
const titleMatches = computed(() => titleConfirmation.value.trim() === props.course.title.trim())

watch(showDelete, (open) => {
  if (!open) titleConfirmation.value = ''
})

async function onArchive() {
  archiving.value = true
  try {
    const updated = await coursesApi.archive(props.course.id)
    toast.success(t('courses.archiveConfirm.done'))
    showArchive.value = false
    emit('archived', updated)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    archiving.value = false
  }
}

async function onDelete() {
  if (!titleMatches.value) return
  deleting.value = true
  try {
    await coursesApi.remove(props.course.id)
    toast.success(t('courses.deleteConfirm.done'))
    showDelete.value = false
    emit('deleted', props.course.id)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="canArchive || canDelete" class="flex items-center gap-1.5">
    <template v-if="layout === 'icons'">
      <button
        v-if="canArchive"
        type="button"
        class="rounded-md bg-surface/80 p-1.5 text-ink-muted backdrop-blur-md transition-default hover:bg-surface-2 hover:text-ink"
        :title="t('courses.archive')"
        :aria-label="t('courses.archive')"
        @click.stop="showArchive = true"
      >
        <Icon name="eye-off" size="16" />
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="rounded-md bg-surface/80 p-1.5 text-ink-muted backdrop-blur-md transition-default hover:bg-danger hover:text-danger-foreground"
        :title="t('courses.delete')"
        :aria-label="t('courses.delete')"
        @click.stop="showDelete = true"
      >
        <Icon name="trash" size="16" />
      </button>
    </template>

    <template v-else>
      <AppButton v-if="canArchive" variant="outline" :size="size" @click="showArchive = true">
        {{ t('courses.archive') }}
      </AppButton>
      <AppButton v-if="canDelete" variant="danger" :size="size" icon="trash" @click="showDelete = true">
        {{ t('courses.delete') }}
      </AppButton>
    </template>

    <Modal v-model="showArchive" size="sm" :title="t('courses.archiveConfirm.title')">
      <p class="text-small text-ink-muted">{{ t('courses.archiveConfirm.body', { title: course.title }) }}</p>
      <template #footer>
        <AppButton variant="ghost" :disabled="archiving" @click.stop="showArchive = false">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton variant="primary" :loading="archiving" @click.stop="onArchive">
          {{ t('courses.archiveConfirm.confirm') }}
        </AppButton>
      </template>
    </Modal>

    <Modal v-model="showDelete" size="sm" :title="t('courses.deleteConfirm.title')">
      <p class="text-small text-ink-muted">{{ t('courses.deleteConfirm.body', { title: course.title }) }}</p>
      <p class="mt-4 text-small text-ink">{{ t('courses.deleteConfirm.prompt') }}</p>
      <AppInput
        v-model="titleConfirmation"
        class="mt-2"
        :placeholder="course.title"
        :error="titleConfirmation && !titleMatches ? t('courses.deleteConfirm.mismatch') : ''"
        @click.stop
      />
      <template #footer>
        <AppButton variant="ghost" :disabled="deleting" @click.stop="showDelete = false">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton variant="danger" :disabled="!titleMatches" :loading="deleting" @click.stop="onDelete">
          {{ deleting ? t('courses.deleteConfirm.deleting') : t('courses.deleteConfirm.confirm') }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { eventsApi } from '@/services/events'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Modal from '@/components/ui/Modal.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const showCreateModal = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', type: 'MEETING', startAt: '', endAt: '', location: '' })

const typeMeta = {
  MEETING: { icon: 'users', variant: 'primary' },
  TRAINING: { icon: 'graduation-cap', variant: 'success' },
  SEMINAR: { icon: 'message-square', variant: 'info' },
  EVENT: { icon: 'calendar', variant: 'warning' },
  ANNOUNCEMENT: { icon: 'newspaper', variant: 'neutral' },
}

const typeOptions = Object.keys(typeMeta).map((value) => ({ value, label: t('eventTypes.' + value) }))

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isThisWeek(date, now) {
  const diff = (date - now) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff < 7
}

const groups = computed(() => {
  const now = new Date()
  const today = []
  const week = []
  const later = []
  for (const ev of items.value) {
    const date = new Date(ev.startAt)
    if (isSameDay(date, now)) today.push(ev)
    else if (isThisWeek(date, now)) week.push(ev)
    else later.push(ev)
  }
  return [
    { key: 'today', label: t('events.today'), items: today },
    { key: 'thisWeek', label: t('events.thisWeek'), items: week },
    { key: 'later', label: t('events.later'), items: later },
  ].filter((g) => g.items.length)
})

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await eventsApi.calendar({})
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function onCreateSubmit() {
  createSubmitting.value = true
  createError.value = ''
  try {
    await eventsApi.create({
      title: createForm.title,
      type: createForm.type,
      startAt: new Date(createForm.startAt).toISOString(),
      endAt: new Date(createForm.endAt).toISOString(),
      location: createForm.location,
    })
    showCreateModal.value = false
    Object.assign(createForm, { title: '', type: 'MEETING', startAt: '', endAt: '', location: '' })
    await load()
  } catch (error) {
    createError.value = apiErrorText(error)
  } finally {
    createSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-h1 text-ink">{{ t('events.title') }}</h1>
      <AppButton v-if="auth.hasPermission('event:create')" icon="plus" @click="showCreateModal = true">{{ t('events.newEvent') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-4">
      <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <template v-else-if="items.length">
      <div v-for="group in groups" :key="group.key" class="mt-8 first:mt-6">
        <h2 class="mb-3 text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ group.label }}</h2>
        <div class="relative space-y-4 border-l border-border pl-6">
          <div v-for="ev in group.items" :key="ev.id" class="relative">
            <span class="absolute -left-[29px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
            <AppCard hover class="cursor-pointer" @click="router.push(`/events/${ev.id}`)">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <Badge :variant="typeMeta[ev.type]?.variant ?? 'neutral'" size="sm">
                      <Icon :name="typeMeta[ev.type]?.icon ?? 'calendar'" size="11" class="mr-1" />
                      {{ t('eventTypes.' + ev.type) }}
                    </Badge>
                  </div>
                  <h3 class="mt-2 text-small font-semibold text-ink">{{ ev.title }}</h3>
                  <p v-if="ev.description" class="mt-1 text-caption text-ink-muted">{{ ev.description }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-faint">
                    <span class="flex items-center gap-1"><Icon name="clock" size="12" />{{ new Date(ev.startAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</span>
                    <span v-if="ev.location" class="flex items-center gap-1"><Icon name="map-pin" size="12" />{{ ev.location }}</span>
                    <span v-if="ev.requiresRegistration && ev.capacity" class="flex items-center gap-1">
                      <Icon name="users" size="12" />{{ t('events.seats', { taken: ev.registeredCount, total: ev.capacity }) }}
                    </span>
                    <span v-else-if="ev.participants?.length" class="flex items-center gap-1"><Icon name="users" size="12" />{{ ev.participants.length }}</span>
                  </div>
                </div>
                <Icon name="chevron-right" size="16" class="shrink-0 text-ink-faint" />
              </div>
            </AppCard>
          </div>
        </div>
      </div>
    </template>

    <EmptyState v-else icon="calendar" :title="t('events.empty')" class="mt-6" />

    <Modal v-model="showCreateModal" :title="t('events.newEvent')">
      <form class="space-y-4" @submit.prevent="onCreateSubmit">
        <AppInput v-model="createForm.title" required :label="t('courses.fields.title')" />
        <AppSelect v-model="createForm.type" :label="t('events.type')" :options="typeOptions" />
        <AppInput v-model="createForm.location" :label="t('events.location')" />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AppDatePicker v-model="createForm.startAt" with-time required :label="t('events.startAt')" />
          <AppDatePicker v-model="createForm.endAt" with-time required :label="t('events.endAt')" />
        </div>
        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="showCreateModal = false">{{ t('courses.cancel') }}</AppButton>
          <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('courses.creating') : t('courses.create') }}</AppButton>
        </div>
      </form>
    </Modal>
  </div>
</template>

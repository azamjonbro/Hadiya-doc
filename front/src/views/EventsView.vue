<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { eventsApi } from '@/services/events'

const { t } = useI18n()
const auth = useAuthStore()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const showCreateForm = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', type: 'MEETING', startAt: '', endAt: '', location: '' })

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await eventsApi.calendar({})
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
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
    showCreateForm.value = false
    Object.assign(createForm, { title: '', type: 'MEETING', startAt: '', endAt: '', location: '' })
    await load()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('events.title') }}</h1>
      <button
        v-if="auth.hasPermission('event:create')"
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? t('courses.cancel') : t('events.newEvent') }}
      </button>
    </div>

    <form
      v-if="showCreateForm"
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      @submit.prevent="onCreateSubmit"
    >
      <input v-model="createForm.title" required :placeholder="t('courses.fields.title')" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <select v-model="createForm.type" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
        <option value="MEETING">MEETING</option>
        <option value="TRAINING">TRAINING</option>
        <option value="SEMINAR">SEMINAR</option>
        <option value="EVENT">EVENT</option>
        <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
      </select>
      <input v-model="createForm.location" :placeholder="t('events.location')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <label class="text-sm">
        {{ t('events.startAt') }}
        <input v-model="createForm.startAt" type="datetime-local" required class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      </label>
      <label class="text-sm">
        {{ t('events.endAt') }}
        <input v-model="createForm.endAt" type="datetime-local" required class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      </label>

      <p v-if="createError" class="col-span-2 text-sm text-red-500">{{ createError }}</p>

      <button type="submit" :disabled="createSubmitting" class="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
        {{ createSubmitting ? t('courses.creating') : t('courses.create') }}
      </button>
    </form>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li v-for="event in items" :key="event.id" class="p-4">
        <p class="font-medium">{{ event.title }}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ event.type }} · {{ new Date(event.startAt).toLocaleString() }}
          <template v-if="event.location"> · {{ event.location }}</template>
        </p>
      </li>
      <li v-if="!loading && items.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('events.empty') }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { newsApi } from '@/services/news'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const news = ref(null)

const form = reactive({ title: '', content: '', tags: '', departmentTargets: '', roleTargets: '', status: 'DRAFT', expiryAt: '' })

function toList(value) {
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.getById(route.params.id)
    form.title = news.value.title
    form.content = news.value.content
    form.tags = news.value.tags.join(', ')
    form.departmentTargets = news.value.departmentTargets.join(', ')
    form.roleTargets = news.value.roleTargets.join(', ')
    form.status = news.value.status
    form.expiryAt = news.value.expiryAt ? news.value.expiryAt.slice(0, 10) : ''
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.update(route.params.id, {
      title: form.title,
      content: form.content,
      tags: toList(form.tags),
      departmentTargets: toList(form.departmentTargets),
      roleTargets: toList(form.roleTargets),
      status: form.status,
      expiryAt: form.expiryAt ? new Date(form.expiryAt).toISOString() : null,
    })
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  try {
    await newsApi.remove(route.params.id)
    router.push('/admin/news')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/admin/news')">
      <Icon name="chevron-left" size="16" />
      {{ t('news.title') }}
    </button>

    <Skeleton v-if="loading" class="mt-5 h-64 w-full" />

    <template v-else-if="news">
      <h1 class="mt-4 text-h1 text-ink">{{ news.title }}</h1>

      <AppCard class="mt-6">
        <form class="grid grid-cols-2 gap-4" @submit.prevent="onSave">
          <div class="col-span-2"><AppInput v-model="form.title" :label="t('news.fields.title')" :disabled="!auth.hasPermission('news:manage')" /></div>
          <div class="col-span-2">
            <label class="mb-1.5 block text-small font-medium text-ink">{{ t('news.fields.content') }}</label>
            <textarea v-model="form.content" :disabled="!auth.hasPermission('news:manage')" rows="6" class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50" />
          </div>
          <AppInput v-model="form.tags" :label="t('news.fields.tags')" :disabled="!auth.hasPermission('news:manage')" />
          <AppSelect v-model="form.status" :label="t('courses.status.label')" :disabled="!auth.hasPermission('news:manage')" :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }]" />
          <AppInput v-model="form.departmentTargets" :label="t('news.fields.departmentTargets')" :disabled="!auth.hasPermission('news:manage')" />
          <AppInput v-model="form.roleTargets" :label="t('news.fields.roleTargets')" :disabled="!auth.hasPermission('news:manage')" />
          <div class="col-span-2"><AppInput v-model="form.expiryAt" type="date" :label="t('news.fields.expiryAt')" :disabled="!auth.hasPermission('news:manage')" /></div>

          <p v-if="errorMessage" class="col-span-2 text-small text-danger">{{ errorMessage }}</p>

          <div v-if="auth.hasPermission('news:manage')" class="col-span-2 flex gap-3 pt-1">
            <AppButton type="submit" :loading="saving">{{ saving ? t('courses.saving') : t('courses.save') }}</AppButton>
            <AppButton type="button" variant="danger" @click="onDelete">{{ t('news.delete') }}</AppButton>
          </div>
        </form>
      </AppCard>
    </template>
  </div>
</template>

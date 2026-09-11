<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { newsApi } from '@/services/news'
import Avatar from '@/components/ui/Avatar.vue'
import Drawer from '@/components/ui/Drawer.vue'
import { uploadsApi } from '@/services/uploads'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const news = ref(null)

const form = reactive({ title: '', content: '', cover: '', subtitle: '', tags: '', departmentTargets: '', roleTargets: [], status: 'DRAFT', expiryAt: '' })
const settingsOpen = ref(false)
const showTags = ref(false)
const showSubtitle = ref(false)

// The title and the body grow with their text: a sheet, not a form.
function autosize(event) {
  const el = event.target
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// The cover goes through the media library like a course cover does.
async function onCoverPick(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const { url } = await uploadsApi.image(file)
    form.cover = url
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    event.target.value = ''
  }
}
const roleOptions = Object.values(ROLES)

function toList(value) {
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

function toggleRole(role) {
  const index = form.roleTargets.indexOf(role)
  if (index === -1) form.roleTargets.push(role)
  else form.roleTargets.splice(index, 1)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.getById(route.params.id)
    form.title = news.value.title
    form.content = news.value.content
    form.cover = news.value.cover ?? ''
    form.subtitle = news.value.subtitle ?? ''
    form.tags = news.value.tags.join(', ')
    form.departmentTargets = news.value.departmentTargets.join(', ')
    form.roleTargets = [...news.value.roleTargets]
    form.status = news.value.status
    form.expiryAt = news.value.expiryAt ? news.value.expiryAt.slice(0, 10) : ''
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function onSave(closeSettings = false) {
  saving.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.update(route.params.id, {
      title: form.title,
      content: form.content,
      cover: form.cover,
      subtitle: form.subtitle,
      tags: toList(form.tags),
      departmentTargets: toList(form.departmentTargets),
      roleTargets: form.roleTargets,
      status: form.status,
      expiryAt: form.expiryAt ? new Date(form.expiryAt).toISOString() : null,
    })
    if (closeSettings) settingsOpen.value = false
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  if (!(await confirm.ask({ message: t('confirm.deleteNews') }))) return
  try {
    await newsApi.remove(route.params.id)
    router.push('/bos/news')
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  }
}

onMounted(load)
</script>

<template>
  <!-- Rasn 25: the editor takes the whole window — a thin bar with the
       back arrow, the article's name and its status chip, the author,
       preview and "Settings & publish"; then a white sheet with the
       cover / label / subtitle chips, the big title and the body. -->
  <div class="fixed inset-0 z-40 flex flex-col bg-surface-2">
    <div class="flex h-14 shrink-0 items-center justify-between gap-4 px-4">
      <div class="flex min-w-0 items-center gap-3">
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.back')" @click="router.push('/bos/news')">
          <Icon name="chevron-left" size="18" />
        </button>
        <p class="truncate text-[15px] text-ink">{{ form.title || t('news.newArticle') }}</p>
        <span class="flex shrink-0 items-center gap-1 rounded-full bg-surface-hover px-2.5 py-0.5 text-[12px] text-ink-muted">
          <Icon :name="form.status === 'PUBLISHED' ? 'check-circle' : 'clock'" size="12" />
          {{ form.status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar" size="sm" />
        <router-link v-if="news" :to="`/news/${news.id}`" class="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-ink-muted shadow-sm transition-default hover:text-ink" :title="t('common.viewDetails')">
          <Icon name="play" size="16" />
        </router-link>
        <button
          v-if="auth.hasPermission('news:manage')"
          type="button"
          class="flex h-9 items-center gap-2 rounded-lg bg-[#2B2B2B] px-4 text-[14px] font-medium text-white transition-default hover:bg-black"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = true"
        >
          {{ t('news.editor.settingsPublish') }}<Icon name="chevron-right" size="14" />
        </button>
      </div>
    </div>

    <Skeleton v-if="loading" class="mx-4 mb-4 flex-1 rounded-2xl" />

    <div v-else-if="news" class="mx-4 mb-4 flex-1 overflow-y-auto rounded-2xl bg-surface shadow-sm">
      <div class="mx-auto w-full max-w-[760px] px-6 py-16">
        <!-- Cover: the chip until one is set, the image with the chip
             over it afterwards -->
        <div v-if="form.cover" class="relative mb-8 overflow-hidden rounded-xl">
          <img :src="form.cover" alt="" class="max-h-[320px] w-full object-cover" />
          <button type="button" class="absolute right-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 text-[13px] text-slate-800 shadow" @click="form.cover = ''">{{ t('common.delete') }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-3.5 py-2 text-[14px] text-ink transition-default hover:bg-surface-hover">
            <Icon name="image" size="16" />{{ t('news.editor.cover') }}
            <input type="file" accept="image/*" class="hidden" :disabled="!auth.hasPermission('news:manage')" @change="onCoverPick" />
          </label>
          <button type="button" class="flex items-center gap-2 rounded-lg bg-surface-2 px-3.5 py-2 text-[14px] text-ink transition-default hover:bg-surface-hover" @click="showTags = !showTags">
            <Icon name="star" size="16" />{{ t('news.editor.label') }}
          </button>
          <button type="button" class="flex items-center gap-2 rounded-lg bg-surface-2 px-3.5 py-2 text-[14px] text-ink transition-default hover:bg-surface-hover" @click="showSubtitle = !showSubtitle">
            <Icon name="list" size="16" />{{ t('news.editor.subtitle') }}
          </button>
        </div>
        <div v-if="showTags" class="mt-3 max-w-md"><AppInput v-model="form.tags" :placeholder="t('news.fields.tags')" :disabled="!auth.hasPermission('news:manage')" /></div>

        <textarea
          v-model="form.title"
          rows="1"
          class="mt-6 w-full resize-none border-0 bg-transparent p-0 text-[40px] font-bold leading-tight text-ink outline-none placeholder:text-ink-faint"
          :placeholder="t('news.editor.titlePlaceholder')"
          :disabled="!auth.hasPermission('news:manage')"
          @input="autosize"
        ></textarea>
        <input
          v-if="showSubtitle || form.subtitle"
          v-model="form.subtitle"
          type="text"
          class="mt-2 w-full border-0 bg-transparent p-0 text-[20px] text-ink-muted outline-none placeholder:text-ink-faint"
          :placeholder="t('news.editor.subtitle')"
          :disabled="!auth.hasPermission('news:manage')"
        />
        <textarea
          v-model="form.content"
          rows="12"
          class="mt-6 w-full resize-none border-0 bg-transparent p-0 text-[17px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          :placeholder="t('news.editor.bodyPlaceholder')"
          :disabled="!auth.hasPermission('news:manage')"
          @input="autosize"
        ></textarea>

        <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>
      </div>
    </div>
    <p v-else-if="errorMessage" class="p-6 text-small text-danger">{{ errorMessage }}</p>

    <!-- Bottom toolbar: save, delete — the reference's "+ Aa 🖼 …" strip -->
    <div v-if="news && auth.hasPermission('news:manage')" class="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
      <div class="pointer-events-auto flex items-center gap-2 rounded-2xl bg-surface p-2 shadow-xl">
        <AppButton size="sm" :loading="saving" @click="onSave(false)">{{ saving ? t('courses.saving') : t('courses.save') }}</AppButton>
        <AppButton size="sm" variant="ghost" icon="trash" @click="onDelete">{{ t('news.delete') }}</AppButton>
      </div>
    </div>

    <!-- Settings & publish -->
    <Drawer v-model="settingsOpen" :title="t('news.editor.settingsPublish')" width="max-w-[440px]">
      <div class="space-y-4">
        <AppSelect v-model="form.status" :label="t('courses.status.label')" :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }]" />
        <AppInput v-model="form.departmentTargets" :label="t('news.fields.departmentTargets')" />
        <div>
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('news.fields.roleTargets') }}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border-strong p-3">
            <label v-for="role in roleOptions" :key="role" class="flex items-center gap-2 text-small text-ink">
              <input type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" :checked="form.roleTargets.includes(role)" @change="toggleRole(role)" />
              {{ role }}
            </label>
          </div>
        </div>
        <AppDatePicker v-model="form.expiryAt" :label="t('news.fields.expiryAt')" />
        <AppInput v-model="form.tags" :label="t('news.fields.tags')" />
        <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <AppButton variant="ghost" @click="settingsOpen = false">{{ t('common.cancel') }}</AppButton>
          <AppButton :loading="saving" @click="onSave(true)">{{ form.status === 'PUBLISHED' ? t('news.editor.publish') : t('courses.save') }}</AppButton>
        </div>
      </div>
    </Drawer>
  </div>
</template>

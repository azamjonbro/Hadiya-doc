<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKb } from '@/composables/useKb'
import { kbApi } from '@/services/kb'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppButton from '@/components/ui/AppButton.vue'
import RichText from '@/components/ui/RichText.vue'

/**
 * A new article (reference §5 modal, as a page because the body is long):
 * title, space, summary, body. Published straight away — a draft an
 * employee cannot see is an admin-panel concern, and there is no admin
 * KB page yet.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { categories, loadCategories } = useKb()

const form = ref({ title: '', categoryId: String(route.query.space ?? ''), summary: '', body: '' })
const saving = ref(false)

const spaceOptions = computed(() => [
  { value: '', label: t('portal.kb.noSpace') },
  ...categories.value.map((category) => ({ value: category.id, label: category.name })),
])

async function save() {
  if (!form.value.title.trim()) return
  saving.value = true
  try {
    const created = await kbApi.create({
      title: form.value.title.trim(),
      categoryId: form.value.categoryId || null,
      summary: form.value.summary.trim() || undefined,
      body: form.value.body || undefined,
      status: 'PUBLISHED',
    })
    await loadCategories(true)
    router.replace({ name: 'kb-article', params: { slug: created.slug } })
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

onMounted(() => loadCategories().catch(() => {}))
</script>

<template>
  <div class="mx-auto w-full max-w-[880px] px-4 py-6">
    <h1 class="text-[22px] font-semibold text-ink">{{ t('portal.kb.newArticle') }}</h1>
    <div class="mt-4 space-y-4 rounded-xl bg-surface p-6 shadow-sm">
      <AppInput v-model="form.title" :label="t('portal.kb.articleTitle')" required maxlength="200" />
      <AppSelect v-model="form.categoryId" :label="t('portal.kb.space')" :options="spaceOptions" />
      <AppInput v-model="form.summary" :label="t('portal.kb.summary')" maxlength="1000" />
      <div>
        <p class="mb-1.5 text-[13px] text-ink-muted">{{ t('portal.kb.body') }}</p>
        <RichText v-model="form.body" min-height="16rem" />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <AppButton variant="secondary" @click="router.back()">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!form.title.trim()" @click="save">{{ t('portal.kb.publish') }}</AppButton>
      </div>
    </div>
  </div>
</template>

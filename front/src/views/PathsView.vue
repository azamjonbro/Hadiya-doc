<script setup>
/**
 * The programmes an employee can see: what they are on, and what they may join.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const items = ref([])
const loading = ref(true)
const joining = ref('')

// Enrolled first: this page is usually opened to continue something, not to
// browse.
const mine = computed(() => items.value.filter((path) => path.enrollment))
const available = computed(() => items.value.filter((path) => !path.enrollment))

async function load() {
  loading.value = true
  try {
    items.value = await pathsApi.list()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function join(path) {
  joining.value = path.id
  try {
    await pathsApi.enroll(path.id)
    toast.success(t('paths.joined'))
    router.push(`/paths/${path.id}`)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.joinError')))
  } finally {
    joining.value = ''
  }
}

const kindVariant = { ONBOARDING: 'info', CERTIFICATION: 'success', DEVELOPMENT: 'primary', GENERAL: 'neutral' }
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ t('paths.title') }}</h1>
        <p class="mt-2 text-white/80 max-w-2xl text-body drop-shadow">{{ t('paths.subtitle') }}</p>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 3" :key="n" class="h-28 w-full rounded-md border border-border" />
    </div>

    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="layers"
      :title="t('paths.emptyTitle')"
      :description="t('paths.emptyDescription')"
    />

    <template v-else>
      <section v-if="mine.length" class="mt-6">
        <h2 class="text-h3 text-ink">{{ t('paths.mine') }}</h2>
        <div class="mt-3 space-y-3">
          <AppCard
            v-for="path in mine"
            :key="path.id"
            hover
            class="cursor-pointer p-6 border border-border shadow-sm"
            @click="router.push(`/paths/${path.id}`)"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="truncate text-h3 text-ink">{{ path.title }}</h3>
                  <Badge :variant="kindVariant[path.kind]" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
                  <Badge v-if="path.enrollment.status === 'COMPLETED'" variant="success" size="sm">
                    {{ t('paths.completed') }}
                  </Badge>
                </div>
                <p v-if="path.description" class="mt-1 line-clamp-2 text-small text-ink-muted">{{ path.description }}</p>
              </div>
              <Icon name="chevron-right" size="18" class="shrink-0 text-ink-faint" />
            </div>
            <div class="mt-3">
              <ProgressBar :value="path.enrollment.completionPercent" />
              <p class="mt-1.5 text-caption text-ink-faint">
                {{ t('paths.progress', { percent: path.enrollment.completionPercent, count: path.requiredCount }) }}
              </p>
            </div>
          </AppCard>
        </div>
      </section>

      <section v-if="available.length" class="mt-8">
        <h2 class="text-h3 text-ink">{{ t('paths.available') }}</h2>
        <div class="mt-3 space-y-3">
          <AppCard v-for="path in available" :key="path.id" class="flex flex-wrap items-center justify-between gap-4 p-6 border border-border shadow-sm">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="truncate text-h3 text-ink">{{ path.title }}</h3>
                <Badge :variant="kindVariant[path.kind]" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
              </div>
              <p v-if="path.description" class="mt-1 line-clamp-2 text-small text-ink-muted">{{ path.description }}</p>
              <p class="mt-1.5 text-caption text-ink-faint">
                {{ t('paths.stepCount', { count: path.requiredCount }) }}
                <template v-if="path.sequential"> · {{ t('paths.sequential') }}</template>
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <AppButton variant="secondary" @click="router.push(`/paths/${path.id}`)">{{ t('paths.view') }}</AppButton>
              <AppButton :loading="joining === path.id" @click="join(path)">{{ t('paths.join') }}</AppButton>
            </div>
          </AppCard>
        </div>
      </section>
    </template>
    </div>
  </div>
</template>

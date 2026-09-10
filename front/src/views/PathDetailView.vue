<script setup>
/**
 * One programme, step by step.
 *
 * The lock state comes from the server (pathSequence.js), so a locked step
 * is greyed here for the same reason it is refused there — the difference
 * being that this way somebody sees *why* rather than clicking through to
 * a 403.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const path = ref(null)
const loading = ref(true)
const joining = ref(false)

const nextStep = computed(() =>
  path.value?.items.find((item) => !item.completed && !item.locked && !item.missing) ?? null
)

async function load() {
  loading.value = true
  try {
    path.value = await pathsApi.getById(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function join() {
  joining.value = true
  try {
    path.value = await pathsApi.enroll(route.params.id)
    toast.success(t('paths.joined'))
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.joinError')))
  } finally {
    joining.value = false
  }
}

function open(item) {
  if (item.locked || item.missing) return
  router.push(`/courses/${item.refId}`)
}

function blockedTitle(item) {
  const blocker = path.value.items.find((entry) => entry.refId === item.blockedBy)
  return blocker?.title ?? ''
}

onMounted(load)
</script>

  <div class="min-h-screen bg-bg pb-12">
    <div v-if="loading" class="mx-auto max-w-6xl px-6 py-8 mt-12 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-md border border-border" />
    </div>

    <template v-else-if="path">
      <!-- Full Width Hero Banner -->
      <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-900 to-purple-800"></div>
        <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMnYtNGg0VjRoLTR6TTYuNiAyNy41MmwxLjc2LTMuMy0xLjc2LTMuM0g0LjRsLTEuNzYgMy4zIDEuNzYgMy4zaDIuMnptMjMuNi0xMy4yTDI4LjQ0IDExbDEuNzYtMy4zSDMyLjRsMS43NiAzLjMtMS43NiAzLjNoLTIuMnptMjMuNi0xMy4yTDUyLjA0LS4ybDEuNzYtMy4zSDU2bDEuNzYgMy4zLTEuNzYgMy4zaC0yLjJ6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')]"></div>
        
        <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
          <button type="button" class="flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white mb-6" @click="router.push('/paths')">
            <Icon name="chevron-left" size="16" />
            {{ t('paths.title') }}
          </button>
          
          <div class="flex items-center gap-2 mb-3">
            <Badge variant="primary" class="bg-white/20 text-white border-white/30 backdrop-blur-sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
            <Badge v-if="path.sequential" variant="info" class="bg-white/20 text-white border-white/30 backdrop-blur-sm">{{ t('paths.sequential') }}</Badge>
          </div>
          
          <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div class="flex-1 max-w-3xl">
              <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ path.title }}</h1>
              <p v-if="path.description" class="mt-3 text-body text-white/80 line-clamp-2 drop-shadow">{{ path.description }}</p>
              
              <div class="mt-4 flex items-center gap-6 text-small text-white/70">
                <span class="flex items-center gap-1.5"><Icon name="list" size="16" />{{ t('paths.stepCount', { count: path.totalRequired }) }}</span>
              </div>
            </div>
            
            <div class="shrink-0 w-full md:w-80">
              <AppCard v-if="path.enrollment" padding="sm" class="bg-white/10 border border-white/20 backdrop-blur-md shadow-xl text-white">
                <div class="flex items-center justify-between gap-4">
                  <div class="min-w-0">
                    <p class="text-small font-semibold">
                      {{ path.enrollment.status === 'COMPLETED' ? t('paths.completed') : t('paths.inProgress') }}
                    </p>
                    <p class="mt-1 text-caption text-white/70">
                      {{ t('paths.requiredDone', { done: path.completedRequired, total: path.totalRequired }) }}
                    </p>
                  </div>
                  <AppButton v-if="nextStep" variant="primary" size="sm" @click="open(nextStep)" class="shadow-lg shadow-primary/20">{{ t('paths.continue') }}</AppButton>
                </div>
                <ProgressBar class="mt-4" :value="path.completionPercent" :variant="path.complete ? 'success' : 'primary'" />
              </AppCard>
              <AppCard v-else padding="sm" class="bg-white/10 border border-white/20 backdrop-blur-md shadow-xl flex items-center justify-between gap-4">
                <p class="text-small font-medium text-white/80">{{ t('paths.notEnrolled') }}</p>
                <AppButton :loading="joining" variant="primary" size="sm" @click="join">{{ t('paths.join') }}</AppButton>
              </AppCard>
            </div>
          </div>
        </div>
      </div>

      <div class="mx-auto max-w-[1440px] px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div class="lg:col-span-3">
          <div class="space-y-3">
      <h1 class="mt-4 text-h1 text-ink">{{ path.title }}</h1>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="neutral" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
        <Badge v-if="path.sequential" variant="info" size="sm">{{ t('paths.sequential') }}</Badge>
        <span class="text-caption text-ink-faint">{{ t('paths.stepCount', { count: path.totalRequired }) }}</span>
      </div>
      <p v-if="path.description" class="mt-3 text-small text-ink-muted">{{ path.description }}</p>

      <AppCard v-if="path.enrollment" class="mt-6 p-6 border border-border shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-small font-semibold text-ink">
              {{ path.enrollment.status === 'COMPLETED' ? t('paths.completed') : t('paths.inProgress') }}
            </p>
            <p class="mt-1 text-caption text-ink-muted">
              {{ t('paths.requiredDone', { done: path.completedRequired, total: path.totalRequired }) }}
            </p>
          </div>
          <AppButton v-if="nextStep" @click="open(nextStep)">{{ t('paths.continue') }}</AppButton>
        </div>
        <ProgressBar class="mt-4" :value="path.completionPercent" :variant="path.complete ? 'success' : 'primary'" />
      </AppCard>

      <AppCard v-else class="mt-6 flex items-center justify-between gap-4 p-6 border border-border shadow-sm">
        <p class="text-small font-medium text-ink-muted">{{ t('paths.notEnrolled') }}</p>
        <AppButton :loading="joining" @click="join">{{ t('paths.join') }}</AppButton>
      </AppCard>

          <div
            v-for="(item, index) in path.items"
            :key="item.id"
            class="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 transition-default"
          :class="[
            item.locked || item.missing ? 'bg-surface-2/50 shadow-none' : 'cursor-pointer shadow-sm hover:bg-surface-hover',
          ]"
          @click="open(item)"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded text-small font-bold"
            :class="item.completed ? 'bg-success/10 text-success' : item.locked ? 'bg-surface-2 text-ink-faint' : 'bg-primary text-primary'"
          >
            <Icon v-if="item.completed" name="check" size="16" />
            <Icon v-else-if="item.locked" name="lock" size="16" />
            <span v-else>{{ index + 1 }}</span>
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-small font-medium" :class="item.locked ? 'text-ink-muted' : 'text-ink'">
              {{ item.title ?? t('paths.missingCourse') }}
            </p>
            <p class="mt-0.5 text-caption text-ink-faint">
              <template v-if="item.missing">{{ t('paths.missingHint') }}</template>
              <template v-else-if="item.locked && blockedTitle(item)">
                {{ t('paths.blockedBy', { title: blockedTitle(item) }) }}
              </template>
              <template v-else-if="!item.required">{{ t('paths.optional') }}</template>
              <template v-else-if="item.estimatedMinutes">{{ t('courses.minutes', { count: item.estimatedMinutes }) }}</template>
            </p>
          </div>

          <Badge v-if="!item.required" variant="neutral" size="sm">{{ t('paths.optional') }}</Badge>
          <Icon v-else-if="!item.locked && !item.missing" name="chevron-right" size="16" class="shrink-0 text-ink-faint" />
        </div>
          </div>
        </div>
      </div>
    </template>
</template>

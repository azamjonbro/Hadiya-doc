<script setup>
/**
 * What my job asks of me, and where I stand.
 *
 * The screen is sorted by shortfall rather than by category or name: a person
 * opens this to find out what to do next, and the two competencies they are
 * short on should not be somewhere below eleven they already hold. Category
 * still travels on the card, so the grouping is not lost — only demoted.
 *
 * The expiry case is given its own sentence instead of being folded into
 * "gap 2". The API keeps `level` and `effectiveLevel` apart on purpose (an
 * expired assessment is worth 0 today but the level is not erased), and a
 * person whose certificate lapsed needs to read "renew it", not "you never
 * had it".
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { competenciesApi } from '@/services/competencies'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDate } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t, locale } = useI18n()
const toast = useToast()

const profile = ref(null)
const loading = ref(true)
const category = ref('')
const gapsOnly = ref(false)

// Only the four the backend's `statusOf` can return for a person's own row.
const STATUS_VARIANT = {
  MET: 'success',
  GAP: 'warning',
  MISSING: 'danger',
  EXPIRED: 'danger',
  ASSESSED: 'info',
  UNASSESSED: 'neutral',
}

const items = computed(() => profile.value?.items ?? [])

const categories = computed(() =>
  [...new Set(items.value.map((item) => item.category).filter(Boolean))].sort()
)

const gapCount = computed(() => items.value.filter((item) => item.gap > 0).length)

const visible = computed(() => {
  const list = items.value.filter((item) => {
    if (category.value && item.category !== category.value) return false
    if (gapsOnly.value && item.gap <= 0) return false
    return true
  })
  // Biggest shortfall first, then anything still required, then the rest —
  // see the note at the top of the file.
  return [...list].sort((a, b) => b.gap - a.gap || b.required - a.required || a.name.localeCompare(b.name))
})

const headline = computed(() => {
  if (!profile.value) return ''
  if (!profile.value.requiredCount) return t('competency.noRequirementsForYou')
  if (!gapCount.value) return t('competency.meetsAll')
  return t('competency.gapsCount', { count: gapCount.value })
})

const fitVariant = computed(() => {
  const fit = profile.value?.fitPercent ?? 0
  if (fit >= 100) return 'success'
  if (fit >= 60) return 'primary'
  return 'danger'
})

const categoryOptions = computed(() =>
  categories.value.map((entry) => ({ value: entry, label: entry }))
)

/** The rung's name on this competency's own ladder — "3" alone says nothing. */
function levelText(item, value) {
  if (value === null || value === undefined) return t('competency.notAssessed')
  if (value === 0) return t('competency.levelNone')
  const rung = item.levels?.find((level) => level.value === value)
  return rung ? `${value} · ${rung.label}` : String(value)
}

async function load() {
  loading.value = true
  try {
    profile.value = await competenciesApi.mine()
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.loadError')))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-8">
    <div>
      <h1 class="text-h1 text-ink">{{ t('competency.mine') }}</h1>
      <p class="mt-1 text-small text-ink-muted">{{ t('competency.mineSubtitle') }}</p>
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-24 w-full rounded-lg" />
      <Skeleton v-for="n in 4" :key="n" class="h-24 w-full rounded-lg" />
    </div>

    <template v-else-if="profile">
      <AppCard class="mt-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-body font-medium text-ink">{{ headline }}</p>
            <p class="mt-1 text-small text-ink-muted">
              {{ t('competency.fitOf', { met: profile.metCount, required: profile.requiredCount }) }}
            </p>
          </div>
          <div class="w-full sm:w-56">
            <div class="flex items-baseline justify-between">
              <span class="text-caption text-ink-muted">{{ t('competency.fit') }}</span>
              <span class="text-h3 font-semibold text-ink">{{ profile.fitPercent }}%</span>
            </div>
            <ProgressBar class="mt-1.5" :value="profile.fitPercent" :variant="fitVariant" />
          </div>
        </div>
      </AppCard>

      <div v-if="items.length" class="mt-5 flex flex-wrap items-center gap-3">
        <AppSelect
          v-if="categories.length"
          v-model="category"
          class="w-48"
          :aria-label="t('competency.category')"
          :placeholder="t('competency.allCategories')"
          :options="categoryOptions"
        />
        <!-- A toggle rather than a third select: it is the one filter a person
             on this page actually reaches for, and aria-pressed makes its
             state readable without the colour. -->
        <AppButton
          :variant="gapsOnly ? 'primary' : 'secondary'"
          size="sm"
          icon="filter"
          :aria-pressed="gapsOnly"
          @click="gapsOnly = !gapsOnly"
        >
          {{ t('competency.showGapsOnly') }}
        </AppButton>
      </div>

      <EmptyState
        v-if="!items.length"
        class="mt-6"
        icon="layers"
        :title="t('competency.noneYet')"
        :description="t('competency.noRequirementsForYou')"
      />

      <EmptyState
        v-else-if="!visible.length"
        class="mt-6"
        icon="check-circle"
        :title="t('competency.onlyGapsNone')"
        :description="t('competency.meetsAll')"
      />

      <div v-else class="mt-4 space-y-3">
        <AppCard
          v-for="item in visible"
          :key="item.competencyId"
          class="p-4"
          :class="item.status === 'EXPIRED' ? 'border-danger/40' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-muted">{{ item.code }}</span>
                <p class="truncate font-medium text-ink">{{ item.name }}</p>
                <Badge v-if="item.category" variant="info" size="sm">{{ item.category }}</Badge>
                <Badge v-if="item.status !== 'UNASSESSED'" :variant="STATUS_VARIANT[item.status]" size="sm" dot>
                  {{ t(`competency.cell.${item.status}`) }}
                </Badge>
              </div>

              <dl class="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <dt class="text-caption text-ink-faint">{{ t('competency.required') }}</dt>
                  <dd class="text-small text-ink">
                    {{ item.required ? levelText(item, item.required) : t('competency.noRequirements') }}
                  </dd>
                </div>
                <div>
                  <dt class="text-caption text-ink-faint">{{ t('competency.current') }}</dt>
                  <dd class="text-small text-ink" :class="item.status === 'EXPIRED' ? 'line-through opacity-70' : ''">
                    {{ levelText(item, item.level) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-caption text-ink-faint">{{ t('competency.effective') }}</dt>
                  <dd
                    class="text-small"
                    :class="item.effectiveLevel !== item.level ? 'font-medium text-danger' : 'text-ink'"
                  >
                    {{ levelText(item, item.effectiveLevel) }}
                  </dd>
                </div>
              </dl>

              <p v-if="item.status === 'EXPIRED'" class="mt-2 flex items-center gap-1.5 text-caption text-danger">
                <Icon name="alert-triangle" size="13" />
                {{ t('competency.expiredExplain') }} · {{ t('competency.expiredOn', { date: formatDate(item.expiresAt, locale) }) }}
              </p>

              <p class="mt-2 text-caption text-ink-faint">
                <template v-if="item.assessedAt">
                  {{ t('competency.assessedOn', { date: formatDate(item.assessedAt, locale) }) }}
                  <template v-if="item.source"> · {{ t(`competency.sourceLabel.${item.source}`) }}</template>
                  <template v-if="item.expiresAt && item.status !== 'EXPIRED'">
                    · {{ t('competency.expiresOn', { date: formatDate(item.expiresAt, locale) }) }}
                  </template>
                  <template v-else-if="!item.expiresAt"> · {{ t('competency.neverExpires') }}</template>
                </template>
                <template v-else>{{ t('competency.notAssessed') }}</template>
                <template v-if="item.developmentCourseIds?.length">
                  · {{ t('competency.developmentCourses', { count: item.developmentCourseIds.length }) }}
                </template>
              </p>

              <!-- The API sends only the previous rung, not the whole log
                   (the row keeps a bounded history server-side and does not
                   publish it), so this is the one honest "before" to show. -->
              <p v-if="item.previousLevel !== null && item.previousLevel !== undefined" class="mt-1 text-caption text-ink-faint">
                {{ t('competency.history') }}: {{ t('competency.previousLevel', { level: item.previousLevel }) }}
              </p>

              <p v-if="item.note" class="mt-1 text-caption text-ink-muted">{{ item.note }}</p>
            </div>

            <!-- The number the eye is meant to land on. -->
            <div class="shrink-0 text-right">
              <template v-if="item.gap > 0">
                <p class="text-h2 font-semibold leading-none text-danger">−{{ item.gap }}</p>
                <p class="mt-1 text-caption text-danger">{{ t('competency.gapLevels', { count: item.gap }) }}</p>
              </template>
              <template v-else-if="item.required > 0">
                <p class="flex items-center justify-end gap-1.5 text-small font-medium text-success">
                  <Icon name="check-circle" size="16" />
                  {{ t('competency.cell.MET') }}
                </p>
                <p class="mt-1 text-caption text-ink-faint">{{ t('competency.gap') }} 0</p>
              </template>
              <p v-else class="text-caption text-ink-faint">{{ t('competency.noRequirements') }}</p>
            </div>
          </div>
        </AppCard>
      </div>
    </template>

    <EmptyState
      v-else
      class="mt-6"
      icon="alert-circle"
      :title="t('competency.loadError')"
      :description="t('competency.emptyHint')"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { scoreTone } from '@/utils/format'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  icon: { type: String, default: 'activity' },
  // { score: number|null, level: string, components: [{ key, weight, score }] }
  result: { type: Object, required: true },
})

const { t } = useI18n()

const tone = computed(() => scoreTone(props.result.score))
const hasScore = computed(() => props.result.score !== null && props.result.score !== undefined)

// A component scored null means there is nothing to measure yet (no tests
// taken, no tasks assigned) — shown greyed out rather than as a zero, so
// "not started" never looks like "failed".
const components = computed(() => props.result.components ?? [])
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="flex items-start gap-4">
      <div class="shrink-0">
        <div class="relative">
          <ProgressRing :value="result.score ?? 0" :size="96" :stroke-width="9" :variant="tone === 'neutral' ? 'primary' : tone">
            <span v-if="hasScore" class="text-h2 leading-none text-ink">{{ result.score }}</span>
            <span v-else class="text-h3 leading-none text-ink-faint">—</span>
            <span v-if="hasScore" class="mt-0.5 text-caption text-ink-faint">/ 100</span>
          </ProgressRing>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <Icon :name="icon" size="15" class="text-ink-faint" />
          <h3 class="text-small font-semibold text-ink">{{ title }}</h3>
        </div>
        <div class="mt-2">
          <Badge :variant="tone">{{ t(`employee.levels.${result.level}`) }}</Badge>
        </div>
        <p v-if="hint" class="mt-2 text-caption leading-relaxed text-ink-muted">{{ hint }}</p>
      </div>
    </div>

    <dl v-if="components.length" class="mt-5 space-y-3 border-t border-border pt-4">
      <div v-for="component in components" :key="component.key">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-caption text-ink-muted">
            {{ t(`employee.components.${component.key}`) }}
            <span class="text-ink-faint">· {{ component.weight }}%</span>
          </dt>
          <dd class="shrink-0 text-caption font-semibold" :class="component.score === null ? 'text-ink-faint' : 'text-ink'">
            {{ component.score === null ? t('employee.noData') : `${component.score}%` }}
          </dd>
        </div>
        <ProgressBar
          class="mt-1.5"
          size="sm"
          :value="component.score ?? 0"
          :variant="component.score === null ? 'primary' : scoreTone(component.score)"
        />
      </div>
    </dl>
  </div>
</template>

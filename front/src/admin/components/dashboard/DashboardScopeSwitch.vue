<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'

/**
 * Company figures or my team's (8.5).
 *
 * Two screens, not one payload with a filter: the company dashboard is a
 * cached aggregation over everybody, and the team one is computed live for
 * a named list of people. They answer different questions and have
 * different shapes, so the switch moves between them rather than pretending
 * they are one view with a parameter.
 *
 * It is also the way out of a dead end. A manager landing on the company
 * dashboard gets a 403 by design — the cached payload covers people they
 * are fenced from — and until this existed that was the end of the road,
 * with an error message where a link should have been.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const options = [
  { value: 'admin-dashboard', labelKey: 'dashboard.scope.company', icon: 'building' },
  { value: 'admin-team-dashboard', labelKey: 'dashboard.scope.team', icon: 'users' },
]

const current = computed(() => route.name)

function go(name) {
  if (name !== current.value) router.push({ name })
}
</script>

<template>
  <div class="inline-flex rounded-md border border-border bg-surface p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="flex items-center gap-1.5 rounded px-3 py-1.5 text-caption font-medium transition-default"
      :class="
        current === option.value
          ? 'bg-primary-subtle text-primary'
          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      "
      :aria-current="current === option.value ? 'page' : undefined"
      @click="go(option.value)"
    >
      <Icon :name="option.icon" size="14" />
      {{ t(option.labelKey) }}
    </button>
  </div>
</template>

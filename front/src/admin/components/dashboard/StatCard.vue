<script setup>
import Icon from '@/components/ui/Icon.vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  suffix: { type: String, default: '' },
  icon: { type: String, default: '' },
  tone: { type: String, default: 'primary' }, // primary | success | warning | danger
  size: { type: String, default: 'kpi' }, // kpi | compact
  // Where the figure leads — the dashboard's four tiles each stand for a
  // list, so the tile is that list's door. Left out, the card is inert.
  to: { type: [String, Object], default: null },
})

const toneClasses = {
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
}
</script>

<template>
  <!-- Rasm 1: a 48px pale circle with the icon, the figure beside it in
       24px, the label under the figure in grey -->
  <component
    :is="to ? RouterLink : 'div'"
    v-if="size === 'kpi'"
    :to="to ?? undefined"
    class="flex items-center gap-5 rounded-2xl bg-surface px-7 py-7 shadow-sm"
    :class="to && 'transition-default hover:shadow-md hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'"
  >
    <span v-if="icon" class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" :class="toneClasses[tone]">
      <Icon :name="icon" size="20" />
    </span>
    <div class="min-w-0">
      <p class="text-[26px] font-semibold leading-none text-ink">
        {{ value }}<span v-if="suffix" class="text-[16px] font-normal text-ink-muted">{{ suffix }}</span>
      </p>
      <p class="mt-2 truncate text-[15px] text-ink-muted">{{ label }}</p>
    </div>
  </component>

  <div v-else class="rounded-lg border border-border bg-surface p-3.5">
    <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ label }}</p>
    <p class="mt-1 text-h3 text-ink">
      {{ value }}<span v-if="suffix" class="text-small font-normal text-ink-muted">{{ suffix }}</span>
    </p>
  </div>
</template>

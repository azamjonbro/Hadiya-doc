<script setup>
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  suffix: { type: String, default: '' },
  icon: { type: String, default: '' },
  tone: { type: String, default: 'primary' }, // primary | success | warning | danger
  size: { type: String, default: 'kpi' }, // kpi | compact
})

const toneClasses = {
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
}
</script>

<template>
  <div v-if="size === 'kpi'" class="rounded-lg border border-border bg-surface p-5">
    <div class="flex items-center gap-3">
      <span v-if="icon" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" :class="toneClasses[tone]">
        <Icon :name="icon" size="17" />
      </span>
      <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ label }}</p>
    </div>
    <p class="mt-3 text-display text-ink">
      {{ value }}<span v-if="suffix" class="text-h3 font-normal text-ink-muted">{{ suffix }}</span>
    </p>
  </div>

  <div v-else class="rounded-lg border border-border bg-surface p-3.5">
    <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ label }}</p>
    <p class="mt-1 text-h3 text-ink">
      {{ value }}<span v-if="suffix" class="text-small font-normal text-ink-muted">{{ suffix }}</span>
    </p>
  </div>
</template>

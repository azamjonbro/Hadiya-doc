<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: '' },
  size: { type: String, default: 'md' }, // xs | sm | md | lg | xl | 2xl
  status: { type: String, default: '' }, // online | offline | away
})

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join(''),
)

const sizes = {
  xs: 'h-6 w-6 text-caption',
  sm: 'h-8 w-8 text-small',
  md: 'h-10 w-10 text-body',
  lg: 'h-14 w-14 text-h3',
  xl: 'h-20 w-20 text-h2',
  // The profile drawer and page: 110px, halfway over a cover photo.
  '2xl': 'h-[110px] w-[110px] text-[36px]',
}

const palette = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
]

const colorClass = computed(() => {
  let hash = 0
  for (const ch of props.name) hash = (hash * 31 + ch.charCodeAt(0)) % palette.length
  return palette[Math.abs(hash) % palette.length]
})

const statusColor = { online: 'bg-success', offline: 'bg-ink-faint', away: 'bg-warning' }
</script>

<template>
  <div class="relative inline-flex shrink-0">
    <img v-if="src" :src="src" :alt="name" class="rounded-full object-cover" :class="sizes[size]" />
    <div
      v-else
      class="flex items-center justify-center rounded-full font-semibold"
      :class="[sizes[size], colorClass]"
    >
      {{ initials || '?' }}
    </div>
    <span
      v-if="status"
      class="absolute bottom-0 right-0 rounded-full ring-2 ring-surface"
      :class="[statusColor[status], size === 'xl' || size === 'lg' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5']"
    />
  </div>
</template>

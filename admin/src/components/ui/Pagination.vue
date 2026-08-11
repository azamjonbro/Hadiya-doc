<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
})

const emit = defineEmits(['update:page'])

const pages = computed(() => {
  const total = props.totalPages
  const cur = props.page
  const items = new Set([1, total, cur, cur - 1, cur + 1])
  return [...items].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
})

function go(p) {
  if (p >= 1 && p <= props.totalPages) emit('update:page', p)
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-2 disabled:opacity-40"
      :disabled="page === 1"
      @click="go(page - 1)"
    >
      <Icon name="chevron-left" size="16" />
    </button>
    <template v-for="(p, i) in pages" :key="p">
      <span v-if="i > 0 && p - pages[i - 1] > 1" class="px-1 text-ink-faint">…</span>
      <button
        type="button"
        class="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-small font-medium transition-default"
        :class="p === page ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2'"
        @click="go(p)"
      >
        {{ p }}
      </button>
    </template>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-2 disabled:opacity-40"
      :disabled="page === totalPages"
      @click="go(page + 1)"
    >
      <Icon name="chevron-right" size="16" />
    </button>
  </div>
</template>

<script setup>
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'

// The "who is this about" block every bulk modal opens with. A count alone is
// not enough to act on — an admin who mis-ticked one row finds out here,
// before the message goes out, rather than from the toast afterwards.
defineProps({
  users: { type: Array, default: () => [] }, // [{ id, fullName, jshshir, avatar }]
  label: { type: String, default: '' },
})
</script>

<template>
  <div>
    <p v-if="label" class="mb-1.5 text-small font-medium text-ink">{{ label }}</p>
    <ul class="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border-strong p-3">
      <li v-for="user in users" :key="user.id" class="flex items-center gap-2 text-small text-ink">
        <Icon name="check" size="14" class="shrink-0 text-primary" />
        <Avatar :name="user.fullName" :src="user.avatar" size="xs" />
        <span class="truncate">{{ user.fullName }}</span>
        <span class="ml-auto shrink-0 text-caption text-ink-faint">{{ user.jshshir }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@/composables/onClickOutside'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

// The strip that appears above the employees table once anything is ticked.
// It owns no state beyond its own popover: the selection lives in the page,
// and every button here only says which action was asked for.
defineProps({
  count: { type: Number, required: true },
  busy: { type: Boolean, default: false },
  canMessage: { type: Boolean, default: false },
  canManageGroups: { type: Boolean, default: false },
  canDeactivate: { type: Boolean, default: false },
})

const emit = defineEmits(['message', 'group-create', 'group-add', 'group-remove', 'deactivate', 'clear'])

const { t } = useI18n()

const groupMenuOpen = ref(false)
const groupMenuRef = ref(null)
onClickOutside(groupMenuRef, () => (groupMenuOpen.value = false))

// Every item closes the popover on the way out — leaving it open behind a
// modal it just opened is the one thing a menu must never do.
function pick(event) {
  groupMenuOpen.value = false
  emit(event)
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary-subtle px-4 py-2.5">
    <div class="flex items-center gap-2">
      <p class="text-small font-medium text-primary">{{ t('users.bulk.selected', { count }) }}</p>
      <button
        type="button"
        class="rounded-md p-1 text-primary/70 transition-default hover:bg-primary/10 hover:text-primary"
        :aria-label="t('users.bulk.clearSelection')"
        @click="emit('clear')"
      >
        <Icon name="close" size="14" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        v-if="canMessage"
        variant="secondary"
        size="sm"
        icon="send"
        :disabled="busy"
        @click="emit('message')"
      >
        {{ t('users.bulk.message') }}
      </AppButton>

      <div v-if="canManageGroups" ref="groupMenuRef" class="relative">
        <AppButton
          variant="secondary"
          size="sm"
          icon="users"
          :disabled="busy"
          @click="groupMenuOpen = !groupMenuOpen"
        >
          {{ t('users.bulk.group') }}
          <Icon name="chevron-down" size="14" class="ml-0.5" />
        </AppButton>
        <Transition
          enter-active-class="transition-default"
          enter-from-class="opacity-0 scale-95"
          leave-active-class="transition-default"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="groupMenuOpen"
            class="absolute right-0 z-20 mt-2 w-60 rounded-md border border-border bg-surface p-1 shadow-md"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-small text-ink transition-default hover:bg-surface-2"
              @click="pick('group-create')"
            >
              <Icon name="plus" size="14" class="text-ink-faint" />
              {{ t('users.bulk.groupCreate') }}
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-small text-ink transition-default hover:bg-surface-2"
              @click="pick('group-add')"
            >
              <Icon name="users" size="14" class="text-ink-faint" />
              {{ t('users.bulk.groupAdd') }}
            </button>
            <!-- Set apart, and in the danger colour: it is the one item here
                 that takes something away. -->
            <div class="my-1 border-t border-border" />
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-small text-danger transition-default hover:bg-danger/10"
              @click="pick('group-remove')"
            >
              <Icon name="close" size="14" />
              {{ t('users.bulk.groupRemove') }}
            </button>
          </div>
        </Transition>
      </div>

      <AppButton
        v-if="canDeactivate"
        variant="danger"
        size="sm"
        icon="trash"
        :disabled="busy"
        @click="emit('deactivate')"
      >
        {{ t('users.deactivate') }}
      </AppButton>
    </div>
  </div>
</template>

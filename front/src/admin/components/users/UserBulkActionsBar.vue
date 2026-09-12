<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@/composables/onClickOutside'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

// The strip that appears above the employees table once anything is ticked,
// as the reference draws it: "Selected: N", three outlined buttons (assign
// a course, register for an event, add to a group) and a ⋯ with the rest.
// It owns no state beyond its own popover: the selection lives in the page,
// and every button here only says which action was asked for.
defineProps({
  count: { type: Number, required: true },
  busy: { type: Boolean, default: false },
  canMessage: { type: Boolean, default: false },
  canAssign: { type: Boolean, default: false },
  canManageGroups: { type: Boolean, default: false },
  canUpdate: { type: Boolean, default: false },
  canDeactivate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['action', 'clear'])

const { t } = useI18n()

const menuOpen = ref(false)
const menuRef = ref(null)
onClickOutside(menuRef, () => (menuOpen.value = false))

// Every item closes the popover on the way out — leaving it open behind a
// modal it just opened is the one thing a menu must never do.
function pick(action) {
  menuOpen.value = false
  emit('action', action)
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <p class="text-[17px] font-semibold text-ink">{{ t('users.bulk.selected', { count }) }}</p>
      <button
        type="button"
        class="rounded-md p-1 text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
        :aria-label="t('users.bulk.clearSelection')"
        @click="emit('clear')"
      >
        <Icon name="close" size="14" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton v-if="canAssign" variant="outline" icon="graduation-cap" :disabled="busy" @click="pick('course')">
        {{ t('users.actions.course.title') }}
      </AppButton>
      <AppButton v-if="canAssign" variant="outline" icon="calendar" :disabled="busy" @click="pick('event')">
        {{ t('users.actions.event.title') }}
      </AppButton>
      <AppButton v-if="canManageGroups" variant="outline" icon="users" :disabled="busy" @click="pick('group')">
        {{ t('users.bulk.groupAdd') }}
      </AppButton>

      <div ref="menuRef" class="relative">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
          :class="menuOpen ? 'border-primary text-primary' : ''"
          :aria-label="t('users.actions.more')"
          :aria-expanded="menuOpen"
          :disabled="busy"
          @click="menuOpen = !menuOpen"
        >
          <Icon name="more-horizontal" size="18" />
        </button>
        <Transition
          enter-active-class="transition-default"
          enter-from-class="opacity-0 scale-95"
          leave-active-class="transition-default"
          leave-to-class="opacity-0 scale-95"
        >
          <div v-if="menuOpen" class="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
            <button v-if="canUpdate" type="button" class="menu-item" @click="pick('department')">
              <Icon name="layers" size="15" class="text-ink-faint" /> {{ t('users.actions.department.title') }}
            </button>
            <button v-if="canMessage" type="button" class="menu-item" @click="pick('message')">
              <Icon name="send" size="15" class="text-ink-faint" /> {{ t('users.bulk.message') }}
            </button>
            <button v-if="canMessage" type="button" class="menu-item" @click="pick('chat-create')">
              <Icon name="message-square" size="15" class="text-ink-faint" /> {{ t('users.actions.chat-create.title') }}
            </button>
            <button v-if="canMessage" type="button" class="menu-item" @click="pick('chat-add')">
              <Icon name="users" size="15" class="text-ink-faint" /> {{ t('users.actions.chat-add.title') }}
            </button>
            <button v-if="canManageGroups" type="button" class="menu-item" @click="pick('group-create')">
              <Icon name="plus" size="15" class="text-ink-faint" /> {{ t('users.bulk.groupCreate') }}
            </button>
            <button v-if="canManageGroups" type="button" class="menu-item" @click="pick('group-remove')">
              <Icon name="close" size="15" class="text-ink-faint" /> {{ t('users.bulk.groupRemove') }}
            </button>
            <template v-if="canDeactivate">
              <div class="my-1 border-t border-border" />
              <button type="button" class="menu-item" @click="pick('block')">
                <Icon name="lock" size="15" class="text-ink-faint" /> {{ t('users.actions.block') }}
              </button>
              <button type="button" class="menu-item" @click="pick('dismiss')">
                <Icon name="log-out" size="15" class="text-ink-faint" /> {{ t('users.actions.dismiss.title') }}
              </button>
              <button v-if="canDelete" type="button" class="menu-item text-danger" @click="pick('delete')">
                <Icon name="trash" size="15" /> {{ t('common.delete') }}
              </button>
            </template>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.625rem;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 14px;
  color: rgb(var(--color-text));
  transition: background-color 120ms;
}
.menu-item.text-danger {
  color: rgb(var(--color-danger));
}
.menu-item:hover {
  background: rgb(var(--color-surface-2));
}
</style>

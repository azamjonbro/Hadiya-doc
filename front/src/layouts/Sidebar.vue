<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { workspaceNav, systemNav } from './nav'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()
const chat = useChatStore()

const workspace = computed(() => workspaceNav.filter((i) => !i.permission || auth.hasPermission(i.permission)))
const system = computed(() => systemNav)

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <aside
    class="flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200"
    :class="ui.sidebarCollapsed ? 'w-18' : 'w-64'"
  >
    <div class="flex h-16 items-center gap-2.5 px-4" :class="ui.sidebarCollapsed ? 'justify-center px-0' : ''">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon name="graduation-cap" size="17" />
      </div>
      <div v-if="!ui.sidebarCollapsed" class="min-w-0">
        <p class="truncate text-small font-semibold text-ink">{{ t('app.name') }}</p>
        <p class="truncate text-caption text-ink-faint">{{ t('app.workspace') }}</p>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-3">
      <p v-if="!ui.sidebarCollapsed" class="px-2.5 pb-1.5 pt-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupWorkspace') }}
      </p>
      <router-link
        v-for="item in workspace"
        :key="item.name"
        :to="item.path"
        class="relative group mb-1 flex items-center gap-3 px-3 py-2.5 text-small font-medium transition-default overflow-hidden"
        :class="isActive(item.path) ? 'bg-primary/10 text-primary rounded-md' : 'text-ink-muted hover:bg-surface-2 hover:text-ink rounded-md'"
      >
        <div v-if="isActive(item.path)" class="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-md"></div>
        <span class="relative shrink-0">
          <Icon :name="item.icon" size="20" />
          <span
            v-if="item.name === 'chat' && chat.unreadTotal > 0"
            class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
          >
            {{ chat.unreadTotal > 99 ? '99+' : chat.unreadTotal }}
          </span>
        </span>
        <span v-if="!ui.sidebarCollapsed" class="truncate font-semibold">{{ t(item.labelKey) }}</span>
      </router-link>

      <p v-if="!ui.sidebarCollapsed" class="px-3 pb-1.5 pt-6 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupSystem') }}
      </p>
      <div v-else class="my-3 border-t border-border" />
      <router-link
        v-for="item in system"
        :key="item.name"
        :to="item.path"
        class="relative group mb-1 flex items-center gap-3 px-3 py-2.5 text-small font-medium transition-default overflow-hidden"
        :class="isActive(item.path) ? 'bg-primary/10 text-primary rounded-md' : 'text-ink-muted hover:bg-surface-2 hover:text-ink rounded-md'"
      >
        <div v-if="isActive(item.path)" class="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-md"></div>
        <Icon :name="item.icon" size="20" />
        <span v-if="!ui.sidebarCollapsed" class="truncate font-semibold">{{ t(item.labelKey) }}</span>
      </router-link>
    </nav>

    <div class="border-t border-border p-3">
      <button
        type="button"
        class="mb-1 flex w-full items-center justify-center rounded-md py-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
        @click="ui.toggleSidebar()"
      >
        <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" size="16" />
      </button>
      <router-link to="/settings" class="flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-default hover:bg-surface-2" :class="ui.sidebarCollapsed ? 'justify-center' : ''">
        <Avatar :name="auth.user?.fullName ?? ''" size="sm" />
        <div v-if="!ui.sidebarCollapsed" class="min-w-0 text-left">
          <p class="truncate text-small font-medium text-ink">{{ auth.user?.fullName }}</p>
          <p class="truncate text-caption text-ink-faint">{{ auth.user?.role }}</p>
        </div>
      </router-link>
    </div>
  </aside>
</template>

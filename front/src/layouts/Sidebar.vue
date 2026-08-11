<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { workspaceNav, systemNav } from './nav'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

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
        class="group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-small font-medium transition-default"
        :class="isActive(item.path) ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
      >
        <Icon :name="item.icon" size="18" />
        <span v-if="!ui.sidebarCollapsed" class="truncate">{{ t(item.labelKey) }}</span>
      </router-link>

      <p v-if="!ui.sidebarCollapsed" class="px-2.5 pb-1.5 pt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupSystem') }}
      </p>
      <div v-else class="my-3 border-t border-border" />
      <router-link
        v-for="item in system"
        :key="item.name"
        :to="item.path"
        class="group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-small font-medium transition-default"
        :class="isActive(item.path) ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
      >
        <Icon :name="item.icon" size="18" />
        <span v-if="!ui.sidebarCollapsed" class="truncate">{{ t(item.labelKey) }}</span>
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

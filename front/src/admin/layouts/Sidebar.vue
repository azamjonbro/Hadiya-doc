<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useChatStore } from '@/stores/chat'
import { workspaceNav, managementNav, systemNav } from './nav'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()
const chat = useChatStore()

const management = computed(() => managementNav.filter((i) => !i.permission || auth.hasPermission(i.permission)))

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function onNavigate() {
  ui.mobileNavOpen = false
}
</script>

<template>
  <Transition enter-active-class="transition-default" enter-from-class="opacity-0" leave-active-class="transition-default" leave-to-class="opacity-0">
    <div v-if="ui.mobileNavOpen" class="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" @click="ui.mobileNavOpen = false" />
  </Transition>

  <aside
    class="fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 -translate-x-full flex-col border-r border-border bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0"
    :class="[ui.mobileNavOpen ? 'translate-x-0' : '', ui.sidebarCollapsed ? 'lg:w-18' : 'lg:w-64', 'w-64']"
  >
    <div class="flex h-16 items-center gap-2.5 px-4" :class="ui.sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon name="shield" size="16" />
      </div>
      <div class="min-w-0" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
        <p class="truncate text-small font-semibold text-ink">{{ t('admin.app.name') }}</p>
        <p class="truncate text-caption text-ink-faint">{{ auth.user?.role }}</p>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-3">
      <router-link
        v-for="item in workspaceNav"
        :key="item.name"
        :to="item.path"
        class="group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-small font-medium transition-default"
        :class="isActive(item.path) ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        @click="onNavigate"
      >
        <Icon :name="item.icon" size="18" />
        <span :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">{{ t(item.labelKey) }}</span>
      </router-link>

      <p class="px-2.5 pb-1.5 pt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
        {{ t('nav.groupManagement') }}
      </p>
      <router-link
        v-for="item in management"
        :key="item.name"
        :to="item.path"
        class="group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-small font-medium transition-default"
        :class="isActive(item.path) ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        @click="onNavigate"
      >
        <span class="relative shrink-0">
          <Icon :name="item.icon" size="18" />
          <span
            v-if="item.name === 'chat' && chat.unreadTotal > 0"
            class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
          >
            {{ chat.unreadTotal > 99 ? '99+' : chat.unreadTotal }}
          </span>
        </span>
        <span :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">{{ t(item.labelKey) }}</span>
      </router-link>

      <p class="px-2.5 pb-1.5 pt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
        {{ t('nav.groupSystem') }}
      </p>
      <router-link
        v-for="item in systemNav"
        :key="item.name"
        :to="item.path"
        class="group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-small font-medium transition-default"
        :class="isActive(item.path) ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        @click="onNavigate"
      >
        <Icon :name="item.icon" size="18" />
        <span :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">{{ t(item.labelKey) }}</span>
      </router-link>
    </nav>

    <div class="border-t border-border p-3">
      <button
        type="button"
        class="mb-1 hidden w-full items-center justify-center rounded-md py-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink lg:flex"
        @click="ui.toggleSidebar()"
      >
        <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" size="16" />
      </button>
      <router-link to="/admin/settings" class="flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-default hover:bg-surface-2" :class="ui.sidebarCollapsed ? 'lg:justify-center' : ''">
        <Avatar :name="auth.user?.fullName ?? ''" size="sm" />
        <div class="min-w-0 text-left" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
          <p class="truncate text-small font-medium text-ink">{{ auth.user?.fullName }}</p>
          <p class="truncate text-caption text-ink-faint">{{ auth.user?.role }}</p>
        </div>
      </router-link>
    </div>
  </aside>
</template>

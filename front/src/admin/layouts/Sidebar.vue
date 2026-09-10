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
    class="flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200"
    :class="ui.sidebarCollapsed ? 'w-18' : 'w-64'"
  >
    <!-- Named, because a page with two navigations ("main" and the bottom
         bar on a phone) announces both as just "navigation" otherwise, and
         a screen reader's landmark list becomes a guessing game (12.4). -->
    <nav id="main-nav" class="flex-1 overflow-y-auto px-4 py-6" :aria-label="t('a11y.mainNav')">
      <p v-if="!ui.sidebarCollapsed" class="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupWorkspace') }}
      </p>
      <router-link
        v-for="item in workspaceNav"
        :key="item.name"
        :to="item.path"
        class="group mb-1 flex items-center gap-3 rounded-lg px-2 py-2.5 text-small font-semibold transition-default"
        :class="isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
        @click="onNavigate"
      >
        <Icon :name="item.icon" size="18" />
        <span v-if="!ui.sidebarCollapsed">{{ t(item.labelKey) }}</span>
      </router-link>

      <p v-if="!ui.sidebarCollapsed" class="px-2 pb-2 pt-6 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupManagement') }}
      </p>
      <router-link
        v-for="item in management"
        :key="item.name"
        :to="item.path"
        class="group mb-1 flex items-center gap-3 rounded-lg px-2 py-2.5 text-small font-semibold transition-default"
        :class="isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
        @click="onNavigate"
      >
        <span class="relative shrink-0">
          <Icon :name="item.icon" size="18" />
          <span
            v-if="item.name === 'chat' && chat.unreadTotal > 0"
            class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-danger-foreground"
          >
            {{ chat.unreadTotal > 99 ? '99+' : chat.unreadTotal }}
          </span>
        </span>
        <span v-if="!ui.sidebarCollapsed">{{ t(item.labelKey) }}</span>
      </router-link>

      <p v-if="!ui.sidebarCollapsed" class="px-2 pb-2 pt-6 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupSystem') }}
      </p>
      <router-link
        v-for="item in systemNav"
        :key="item.name"
        :to="item.path"
        class="group mb-1 flex items-center gap-3 rounded-lg px-2 py-2.5 text-small font-semibold transition-default"
        :class="isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
        @click="onNavigate"
      >
        <Icon :name="item.icon" size="18" />
        <span v-if="!ui.sidebarCollapsed">{{ t(item.labelKey) }}</span>
      </router-link>
    </nav>

    <div class="border-t border-border p-3">
      <button
        type="button"
        class="flex w-full items-center justify-center rounded py-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
        :aria-label="t('a11y.toggleSidebar')"
        :aria-expanded="!ui.sidebarCollapsed"
        aria-controls="main-nav"
        @click="ui.toggleSidebar()"
      >
        <Icon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" size="16" />
      </button>
    </div>
  </aside>
</template>

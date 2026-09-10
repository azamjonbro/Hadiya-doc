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
        v-for="item in workspace"
        :key="item.name"
        :to="item.path"
        class="relative group mb-1 flex items-center gap-3 px-3 py-2.5 text-small font-semibold transition-default overflow-hidden"
        :class="isActive(item.path) ? 'bg-primary/5 text-primary rounded' : 'text-ink-muted hover:bg-surface-2 hover:text-ink rounded'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
      >
        <div v-if="isActive(item.path)" class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-primary rounded-r"></div>
        <span class="relative shrink-0">
          <Icon :name="item.icon" size="18" :class="isActive(item.path) ? 'text-primary' : 'text-ink-faint group-hover:text-ink-muted'" />
          <span
            v-if="item.name === 'chat' && chat.unreadTotal > 0"
            class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-danger-foreground"
          >
            {{ chat.unreadTotal > 99 ? '99+' : chat.unreadTotal }}
          </span>
        </span>
        <span v-if="!ui.sidebarCollapsed" class="truncate">{{ t(item.labelKey) }}</span>
      </router-link>

      <p v-if="!ui.sidebarCollapsed" class="px-2 pb-2 pt-6 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {{ t('nav.groupSystem') }}
      </p>
      <div v-else class="my-3 border-t border-border" />
      <router-link
        v-for="item in system"
        :key="item.name"
        :to="item.path"
        class="relative group mb-1 flex items-center gap-3 px-3 py-2.5 text-small font-semibold transition-default overflow-hidden"
        :class="isActive(item.path) ? 'bg-primary/5 text-primary rounded' : 'text-ink-muted hover:bg-surface-2 hover:text-ink rounded'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
      >
        <div v-if="isActive(item.path)" class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-primary rounded-r"></div>
        <Icon :name="item.icon" size="18" :class="isActive(item.path) ? 'text-primary' : 'text-ink-faint group-hover:text-ink-muted'" />
        <span v-if="!ui.sidebarCollapsed" class="truncate">{{ t(item.labelKey) }}</span>
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

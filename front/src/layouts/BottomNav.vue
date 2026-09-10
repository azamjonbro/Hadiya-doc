<script setup>
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { bottomNav } from './nav'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-surface/95 backdrop-blur"
    :aria-label="t('a11y.bottomNav')"
  >
    <router-link
      v-for="item in bottomNav"
      :key="item.name"
      :to="item.path"
      class="flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium transition-default"
      :class="isActive(item.path) ? 'text-primary' : 'text-ink-faint'"
      :aria-current="isActive(item.path) ? 'page' : undefined"
    >
      <Icon :name="item.icon" size="19" />
      {{ t(item.labelKey) }}
    </router-link>
    <router-link
      to="/settings"
      class="flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium transition-default"
      :class="isActive('/settings') ? 'text-primary' : 'text-ink-faint'"
      :aria-current="isActive('/settings') ? 'page' : undefined"
    >
      <Icon name="user" size="19" />
      {{ t('nav.profile') }}
    </router-link>
  </nav>
</template>

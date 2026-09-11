<script setup>
/**
 * The icon rail (rasn 1–27): 56px, one icon per section, the current one
 * on a grey square with a green bar at the left edge. Labels are tooltips
 * — the second column names the pages, the rail only says where you are.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { adminSections, sectionFor } from './nav'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const allowed = (item) => !item.permission || auth.hasPermission(item.permission)
const sections = computed(() =>
  adminSections.filter((section) => {
    if (!allowed(section)) return false
    if (!section.children) return true
    return section.children.some(allowed)
  }),
)
const current = computed(() => sectionFor(route.path))
</script>

<template>
  <nav class="flex h-full w-14 shrink-0 flex-col items-center border-r border-border bg-surface pt-3" :aria-label="t('a11y.mainNav')">
    <ul class="flex flex-1 flex-col items-center gap-1">
      <li v-for="section in sections" :key="section.key" class="relative">
        <span v-if="current.key === section.key" class="absolute -left-1 top-2 h-7 w-[3px] rounded-r bg-primary" aria-hidden="true"></span>
        <router-link
          :to="section.path"
          class="flex h-11 w-11 items-center justify-center rounded-lg transition-default"
          :class="current.key === section.key ? 'bg-surface-hover text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
          :title="t(section.labelKey)"
          :aria-label="t(section.labelKey)"
          :aria-current="current.key === section.key ? 'page' : undefined"
        >
          <Icon :name="section.icon" size="20" />
        </router-link>
      </li>
    </ul>
    <div class="flex flex-col items-center gap-2 pb-3">
      <!-- The way back to the employee portal: same session, same tokens -->
      <router-link
        to="/"
        class="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
        :title="t('settings.adminPanel.backToUser')"
        :aria-label="t('settings.adminPanel.backToUser')"
      >
        <Icon name="grid" size="20" />
      </router-link>
      <router-link to="/profile" class="rounded-md" :title="auth.user?.fullName ?? ''">
        <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar" size="sm" class="rounded-md" />
      </router-link>
    </div>
  </nav>
</template>

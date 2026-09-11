<script setup>
/**
 * The phone's bottom bar. Four fixed tabs plus "More", which opens the
 * same three-column menu the desktop "···" shows — on a phone the top
 * bar's centre nav is hidden, and without this the pages behind "···"
 * would be reachable only by typing a URL.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { bottomNav, portalMenuGroups } from './nav'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const moreOpen = ref(false)

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function routeExists(path) {
  const resolved = router.resolve(path)
  return resolved.matched.length > 0 && resolved.name !== 'not-found'
}

const groups = computed(() =>
  portalMenuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((i) => (!i.permission || auth.hasPermission(i.permission)) && routeExists(i.path)),
    }))
    .filter((g) => g.items.length),
)

function go(path) {
  moreOpen.value = false
  router.push(path)
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
    <button
      type="button"
      class="flex flex-1 flex-col items-center justify-center gap-1 text-caption font-medium text-ink-faint transition-default"
      :aria-expanded="moreOpen"
      @click="moreOpen = true"
    >
      <Icon name="more-horizontal" size="19" />
      {{ t('portal.nav.more') }}
    </button>

    <Modal v-model="moreOpen" :title="t('portal.nav.more')">
      <div class="space-y-6">
        <div v-for="group in groups" :key="group.labelKey">
          <p class="mb-1 text-[15px] font-semibold text-ink">{{ t(group.labelKey) }}</p>
          <ul>
            <li v-for="item in group.items" :key="item.name">
              <button
                type="button"
                class="block w-full rounded-lg px-3 py-2.5 text-left text-[14px] transition-default hover:bg-surface-2"
                :class="isActive(item.path) ? 'bg-surface-2 text-ink' : 'text-ink-muted'"
                @click="go(item.path)"
              >
                {{ t(item.labelKey) }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  </nav>
</template>

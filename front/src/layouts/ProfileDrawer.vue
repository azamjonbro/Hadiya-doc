<script setup>
/**
 * The avatar's drawer (reference §9): cover, avatar halfway over it, name,
 * three numbers, then a short menu. The numbers are loaded when the panel
 * opens, not at app boot — three requests for a panel most people open
 * once a day is the wrong trade at startup.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { gamificationApi } from '@/services/gamification'
import { certificatesApi } from '@/services/certificates'
import Drawer from '@/components/ui/Drawer.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const stats = ref({ points: 0, badges: 0, certificates: 0 })
let loaded = false

async function loadStats() {
  if (loaded) return
  loaded = true
  const [summary, certificates] = await Promise.allSettled([gamificationApi.getMySummary(), certificatesApi.mine()])
  if (summary.status === 'fulfilled') {
    stats.value.points = summary.value.totalPoints ?? 0
    stats.value.badges = summary.value.badges?.length ?? 0
  }
  if (certificates.status === 'fulfilled') stats.value.certificates = certificates.value.length
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadStats()
  },
)

function close() {
  emit('update:modelValue', false)
}

function go(to) {
  close()
  router.push(to)
}

async function logout() {
  close()
  await auth.logout()
  router.push({ name: 'login' })
}

const menu = [
  { key: 'achievements', icon: 'award', to: '/leaderboard' },
  { key: 'settings', icon: 'settings', to: '/settings' },
  { key: 'history', icon: 'clock', to: '/profile/history' },
]
</script>

<template>
  <Drawer :model-value="props.modelValue" width="max-w-[560px]" plain @update:model-value="emit('update:modelValue', $event)">
    <div class="relative">
      <!-- Cover: the same shipped photo as the profile page (/hero/profile.jpg),
           the gradient under it for a deployment without the file -->
      <div
        class="h-[150px] w-full bg-cover bg-center bg-gradient-to-br from-emerald-700 via-teal-600 to-sky-700"
        style="background-image: url('/hero/profile.jpg')"
        aria-hidden="true"
      />
      <button
        type="button"
        class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white transition-default hover:bg-black/45"
        :aria-label="t('a11y.closeDialog')"
        @click="close"
      >
        <Icon name="close" size="16" />
      </button>

      <div class="-mt-[55px] flex flex-col items-center px-8">
        <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar ?? ''" size="2xl" class="rounded-full ring-4 ring-surface" />
        <h2 class="mt-4 text-[22px] font-semibold text-ink">{{ auth.user?.fullName }}</h2>
        <p class="mt-1 text-small text-ink-muted">{{ auth.user?.email || auth.user?.position || '' }}</p>

        <dl class="mt-8 grid w-full grid-cols-3 divide-x divide-border">
          <div class="px-2 text-center">
            <dd class="text-[28px] font-medium leading-none text-ink">{{ stats.points }}</dd>
            <dt class="mt-2 text-small text-ink-muted">{{ t('portal.profile.points') }}</dt>
          </div>
          <div class="px-2 text-center">
            <dd class="text-[28px] font-medium leading-none text-ink">{{ stats.badges }}</dd>
            <dt class="mt-2 text-small text-ink-muted">{{ t('portal.profile.badges') }}</dt>
          </div>
          <div class="px-2 text-center">
            <dd class="text-[28px] font-medium leading-none text-ink">{{ stats.certificates }}</dd>
            <dt class="mt-2 text-small text-ink-muted">{{ t('portal.profile.certificates') }}</dt>
          </div>
        </dl>
      </div>

      <div class="mt-10 px-8 pb-8">
        <p class="border-b border-border pb-3 text-small text-ink-muted">{{ t('portal.nav.myProfile') }}</p>
        <ul>
          <li v-if="auth.isSuperAdmin">
            <button type="button" class="flex w-full items-center justify-between border-b border-border py-4 text-left text-[15px] text-ink transition-default hover:text-primary" @click="go({ name: 'admin-dashboard' })">
              {{ t('portal.profile.adminPortal') }}
              <Icon name="chevron-right" size="16" class="text-ink-faint" />
            </button>
          </li>
          <li v-for="item in menu" :key="item.key">
            <button type="button" class="flex w-full items-center justify-between border-b border-border py-4 text-left text-[15px] text-ink transition-default hover:text-primary" @click="go(item.to)">
              {{ t(`portal.profile.${item.key}`) }}
              <Icon name="chevron-right" size="16" class="text-ink-faint" />
            </button>
          </li>
          <li>
            <button type="button" class="flex w-full items-center justify-between border-b border-border py-4 text-left text-[15px] text-ink transition-default hover:text-danger" @click="logout">
              {{ t('portal.profile.logout') }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Drawer>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { setLocale, availableLocales } from '@/i18n'
import { gamificationApi } from '@/services/gamification'
import { BADGE_ICONS } from '@/gamification/badgeIcons'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Tabs from '@/components/ui/Tabs.vue'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const activeTab = ref('profile')
const tabs = computed(() => [
  { value: 'profile', label: t('settings.tabs.profile') },
  { value: 'activity', label: t('settings.tabs.activity') },
  { value: 'preferences', label: t('settings.tabs.preferences') },
])

const languageOptions = computed(() => availableLocales.map((code) => ({ value: code, label: t(`locales.${code}`) })))

function onLocaleChange(code) {
  setLocale(code)
}

const gamification = ref(null)

async function loadGamification() {
  try {
    gamification.value = await gamificationApi.getMySummary()
  } catch {
    gamification.value = null
  }
}

onMounted(loadGamification)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('settings.title') }}</h1>

    <!-- SUPERADMIN only. ADMIN and MANAGER do not see it because they cannot
         enter the admin panel at all — the same rule the /bos guard applies,
         so the button never promises something the guard then refuses. This is
         a convenience, not a control: hiding it protects nothing on its own. -->
    <AppCard v-if="auth.isSuperAdmin" class="mt-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-small font-semibold text-ink">{{ t('settings.adminPanel.title') }}</h2>
          <p class="mt-1 text-caption text-ink-faint">{{ t('settings.adminPanel.hint') }}</p>
        </div>
        <AppButton icon="shield" @click="router.push({ name: 'admin-dashboard' })">
          {{ t('settings.adminPanel.open') }}
        </AppButton>
      </div>
    </AppCard>

    <Tabs class="mt-6" v-model="activeTab" :tabs="tabs" />

    <div class="mt-6 space-y-6">
      <template v-if="activeTab === 'profile'">
        <AppCard>
          <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.profile') }}</h2>
          <div class="mt-3 flex items-center gap-3">
            <Avatar :name="auth.user?.fullName" :src="auth.user?.avatar" size="lg" />
            <div>
              <p class="text-body font-medium text-ink">{{ auth.user?.fullName }}</p>
              <p class="text-small text-ink-faint">{{ auth.user?.email }}</p>
            </div>
          </div>
        </AppCard>
      </template>

      <template v-else-if="activeTab === 'activity'">
        <AppCard v-if="gamification">
          <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.activity') }}</h2>
          <div class="mt-3 grid grid-cols-3 gap-3 text-center">
            <div class="rounded-md bg-surface-2 p-3">
              <p class="text-h3 text-ink">{{ gamification.totalPoints }}</p>
              <p class="text-caption text-ink-faint">{{ t('gamification.points') }}</p>
            </div>
            <div class="rounded-md bg-surface-2 p-3">
              <p class="text-h3 text-ink">{{ gamification.videosCompleted }}</p>
              <p class="text-caption text-ink-faint">{{ t('settings.activity.videosCompleted') }}</p>
            </div>
            <div class="rounded-md bg-surface-2 p-3">
              <p class="text-h3 text-ink">{{ gamification.quizzesPassed }}</p>
              <p class="text-caption text-ink-faint">{{ t('settings.activity.quizzesPassed') }}</p>
            </div>
          </div>
        </AppCard>

        <AppCard v-if="gamification">
          <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.badges') }}</h2>
          <div v-if="gamification.badges.length" class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="code in gamification.badges"
              :key="code"
              class="flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1.5 text-small font-medium text-primary"
            >
              <Icon :name="BADGE_ICONS[code] ?? 'award'" size="14" />
              {{ t(`gamification.badges.${code}.title`) }}
            </span>
          </div>
          <p v-else class="mt-3 text-small text-ink-faint">{{ t('gamification.noBadgesYet') }}</p>
        </AppCard>
      </template>

      <template v-else-if="activeTab === 'preferences'">
        <AppCard>
          <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.appearance') }}</h2>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-body text-ink">{{ t('settings.appearance.theme') }}</span>
            <div class="flex gap-1.5 rounded-md border border-border p-1">
              <button
                type="button"
                class="rounded px-3 py-1 text-small transition-default"
                :class="theme.theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2'"
                @click="theme.theme === 'dark' && theme.toggle()"
              >
                {{ t('settings.appearance.light') }}
              </button>
              <button
                type="button"
                class="rounded px-3 py-1 text-small transition-default"
                :class="theme.theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2'"
                @click="theme.theme === 'light' && theme.toggle()"
              >
                {{ t('settings.appearance.dark') }}
              </button>
            </div>
          </div>
        </AppCard>

        <AppCard>
          <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.language') }}</h2>
          <div class="mt-3">
            <AppSelect :model-value="locale" :options="languageOptions" @update:model-value="onLocaleChange" />
          </div>
        </AppCard>
      </template>
    </div>
  </div>
</template>

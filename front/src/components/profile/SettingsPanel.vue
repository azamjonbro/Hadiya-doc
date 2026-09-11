<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { setLocale, availableLocales } from '@/i18n'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import PanelSwitchCard from '@/components/ui/PanelSwitchCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import PillTabs from '@/components/portal/PillTabs.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AppButton from '@/components/ui/AppButton.vue'
import TwoFactorCard from '@/components/security/TwoFactorCard.vue'
import SessionsCard from '@/components/security/SessionsCard.vue'
import OfflineStorageCard from '@/components/offline/OfflineStorageCard.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const theme = useThemeStore()
const toast = useToast()

const activeTab = ref('profile')
const tabs = computed(() => [
  { value: 'profile', label: t('settings.tabs.profile') },
  { value: 'notifications', label: t('settings.tabs.notifications') },
  { value: 'preferences', label: t('settings.tabs.preferences') },
  // 11.6 — the second factor and the list of devices this account is
  // signed in on. Its own tab rather than a row inside preferences: these
  // are decisions, not settings somebody flips while looking for the
  // theme switch.
  { value: 'security', label: t('settings.tabs.security') },
])

const languageOptions = computed(() => availableLocales.map((code) => ({ value: code, label: t(`locales.${code}`) })))

// Two things happen here, and they are genuinely separate. setLocale changes
// the language of the page in front of the reader. The API call changes the
// language their *notifications* are written in — those are composed on the
// server, often hours later by a cron job, where no browser exists to ask.
async function onLocaleChange(code) {
  setLocale(code)
  try {
    await usersApi.updateLocale(code)
  } catch (error) {
    // The page is already translated; only the server-side half failed.
    toast.error(apiErrorText(error, t('settings.notifications.localeSaveFailed')))
  }
}

// ---- notification preferences ----

const CHANNELS = ['inApp', 'email', 'push']

const prefs = ref(null)
const prefsLoading = ref(false)
const prefsError = ref(false)
const savingKey = ref('')

async function loadPrefs() {
  prefsLoading.value = true
  prefsError.value = false
  try {
    prefs.value = await usersApi.notificationPrefs()
  } catch {
    prefsError.value = true
  } finally {
    prefsLoading.value = false
  }
}

// Types in the order the server sent them — grouped by domain in the seed,
// which reads better than alphabetical.
const prefRows = computed(() =>
  Object.entries(prefs.value?.prefs ?? {}).map(([type, channels]) => ({ type, ...channels }))
)

/**
 * Sends the whole picture, not just the toggle that changed.
 *
 * The endpoint replaces the stored deviations rather than merging them, so a
 * partial body would silently switch everything else back on. The server
 * prunes the `true` entries itself.
 */
async function toggleChannel(row, channel) {
  if (row.mandatory) return
  const key = `${row.type}.${channel}`
  savingKey.value = key
  const next = Object.fromEntries(
    prefRows.value
      .filter((entry) => !entry.mandatory)
      .map((entry) => [
        entry.type,
        Object.fromEntries(
          CHANNELS.map((name) => [
            name,
            entry.type === row.type && name === channel ? !entry[name] : entry[name],
          ])
        ),
      ])
  )
  try {
    prefs.value = await usersApi.updateNotificationPrefs(next)
  } catch (error) {
    toast.error(apiErrorText(error, t('settings.notifications.saveFailed')))
  } finally {
    savingKey.value = ''
  }
}

onMounted(loadPrefs)
</script>

<template>
  <!-- The settings tab of the profile page (reference §10): the account's
       own sections, on the 880px column the page already provides. -->
  <div>
    <!-- SUPERADMIN only. ADMIN and MANAGER never see it, because they cannot
         enter the admin panel at all — the button must not promise something
         the /bos guard then refuses. Convenience, not a control. -->
    <PanelSwitchCard v-if="auth.isSuperAdmin" class="mb-6" direction="admin" />

    <PillTabs class="mt-4" v-model="activeTab" :tabs="tabs" />

    <div class="mt-6 space-y-6">
      <template v-if="activeTab === 'profile'">
        <AppCard class="border border-border shadow-sm p-6">
          <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('settings.sections.profile') }}</h2>
          <div class="mt-4 flex items-center gap-4">
            <Avatar :name="auth.user?.fullName" :src="auth.user?.avatar" size="lg" />
            <div>
              <p class="text-body font-medium text-ink">{{ auth.user?.fullName }}</p>
              <p class="text-small text-ink-faint">{{ auth.user?.email }}</p>
            </div>
          </div>
        </AppCard>
      </template>

      <template v-else-if="activeTab === 'notifications'">
        <AppCard class="border border-border shadow-sm p-6">
          <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('settings.notifications.title') }}</h2>
          <p class="mt-1.5 text-small text-ink-muted">{{ t('settings.notifications.hint') }}</p>

          <Skeleton v-if="prefsLoading" class="mt-4 h-40 w-full" />
          <div v-else-if="prefsError" class="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
            <span class="text-small text-ink-muted">{{ t('settings.notifications.loadFailed') }}</span>
            <AppButton size="sm" variant="ghost" @click="loadPrefs">{{ t('common.retry') }}</AppButton>
          </div>

          <div v-else class="mt-4 overflow-x-auto">
            <table class="w-full min-w-[26rem] border-collapse text-small">
              <thead>
                <tr class="border-b border-border text-ink-muted">
                  <th class="py-2 pr-3 text-left font-medium">{{ t('settings.notifications.event') }}</th>
                  <th v-for="channel in CHANNELS" :key="channel" class="w-20 py-2 text-center font-medium">
                    {{ t(`settings.notifications.channels.${channel}`) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in prefRows" :key="row.type" class="border-b border-border/60 last:border-0">
                  <td class="py-2 pr-3 text-ink">
                    <span>{{ t(`settings.notifications.types.${row.type}`) }}</span>
                    <!-- Locked rather than hidden: someone who wonders why they
                         keep getting password-reset mail deserves the answer
                         on the same screen, not a 400 after clicking. -->
                    <Icon
                      v-if="row.mandatory"
                      name="lock"
                      class="ml-1.5 inline h-3.5 w-3.5 align-text-bottom text-ink-faint"
                      :aria-label="t('settings.notifications.mandatory')"
                    />
                  </td>
                  <td v-for="channel in CHANNELS" :key="channel" class="py-2 text-center">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      :checked="row[channel]"
                      :disabled="row.mandatory || savingKey === `${row.type}.${channel}`"
                      :title="row.mandatory ? t('settings.notifications.mandatory') : ''"
                      :aria-label="`${t(`settings.notifications.types.${row.type}`)} — ${t(`settings.notifications.channels.${channel}`)}`"
                      @change="toggleChannel(row, channel)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppCard>
      </template>

      <template v-else-if="activeTab === 'security'">
        <div class="space-y-4">
          <TwoFactorCard />
          <SessionsCard />
          <!-- 12.2 — what this device is holding, and the button that
               clears it. -->
          <OfflineStorageCard />
        </div>
      </template>

      <template v-else-if="activeTab === 'preferences'">
        <AppCard class="border border-border shadow-sm p-6">
          <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('settings.sections.appearance') }}</h2>
          <div class="mt-4 flex items-center justify-between">
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

        <AppCard class="border border-border shadow-sm p-6">
          <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('settings.sections.language') }}</h2>
          <div class="mt-4">
            <AppSelect :model-value="locale" :options="languageOptions" @update:model-value="onLocaleChange" />
          </div>
        </AppCard>
      </template>
    </div>
  </div>
</template>

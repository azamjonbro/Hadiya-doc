<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { setLocale, availableLocales } from '@/i18n'
import AppCard from '@/components/ui/AppCard.vue'
import PanelSwitchCard from '@/components/ui/PanelSwitchCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import AttentionPolicyForm from '@/admin/components/AttentionPolicyForm.vue'
import FacePolicyForm from '@/admin/components/FacePolicyForm.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const theme = useThemeStore()

const languageOptions = computed(() => availableLocales.map((code) => ({ value: code, label: t(`locales.${code}`) })))

function onLocaleChange(code) {
  setLocale(code)
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('settings.title') }}</h1>

    <!-- Everyone who can reach this page came from the employee side and can
         go back to it; no role check needed. -->
    <PanelSwitchCard class="mt-6" direction="user" />

    <div class="mt-6 space-y-6">
      <AppCard>
        <h2 class="text-small font-semibold text-ink">{{ t('settings.sections.profile') }}</h2>
        <div class="mt-3 flex items-center gap-3">
          <Avatar :name="auth.user?.fullName" size="lg" />
          <div>
            <p class="text-body font-medium text-ink">{{ auth.user?.fullName }}</p>
            <p class="text-small text-ink-faint">{{ auth.user?.email }}</p>
            <p class="text-caption text-ink-faint">{{ auth.user?.role }}</p>
          </div>
        </div>
      </AppCard>

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

      <!-- SUPERADMIN only, like the rest of face verification: how often an
           employee has to prove who they are is not a course-editing
           decision, and there is no per-course override to soften it. -->
      <AppCard v-if="auth.isSuperAdmin">
        <h2 class="text-small font-semibold text-ink">{{ t('facePolicy.title') }}</h2>
        <p class="mt-1 text-caption text-ink-faint">{{ t('facePolicy.hint') }}</p>
        <div class="mt-4">
          <FacePolicyForm />
        </div>
      </AppCard>

      <!-- Organisation-wide default. Individual courses can tighten or relax
           it from their own page; this is what they inherit. -->
      <AppCard v-if="auth.hasPermission('course:read')">
        <h2 class="text-small font-semibold text-ink">{{ t('attention.admin.title') }}</h2>
        <p class="mt-1 text-caption text-ink-faint">{{ t('attention.admin.globalHint') }}</p>
        <div class="mt-4">
          <AttentionPolicyForm :readonly="!auth.hasPermission('course:update')" />
        </div>
      </AppCard>
    </div>
  </div>
</template>

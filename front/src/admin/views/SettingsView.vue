<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { setLocale, availableLocales } from '@/i18n'
import PanelSwitchCard from '@/components/ui/PanelSwitchCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import AttentionPolicyForm from '@/admin/components/AttentionPolicyForm.vue'
import FacePolicyForm from '@/admin/components/FacePolicyForm.vue'
import AiSettingsCard from '@/admin/components/AiSettingsCard.vue'
import ApiKeysCard from '@/admin/components/ApiKeysCard.vue'
import WebhooksCard from '@/admin/components/WebhooksCard.vue'
import SsoSettingsCard from '@/admin/components/SsoSettingsCard.vue'

const { t, te, locale } = useI18n()
const auth = useAuthStore()
const theme = useThemeStore()

const languageOptions = computed(() => availableLocales.map((code) => ({ value: code, label: t(`locales.${code}`) })))

function onLocaleChange(code) {
  setLocale(code)
}

// Rasn 26: three boxed tabs — the basics (account, security), the look,
// and the features (policies, AI, integrations).
const TABS = ['basic', 'design', 'features']
const tab = ref('basic')
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('settings.title') }}</h1>

    <!-- Boxed tabs: the active one on white, joined to the panel below -->
    <div class="mt-5 flex border-b border-border">
      <button
        v-for="key in TABS"
        :key="key"
        type="button"
        role="tab"
        :aria-selected="tab === key"
        class="-mb-px flex h-12 items-center border px-7 text-[15px] transition-default"
        :class="tab === key ? 'border-border border-b-surface bg-surface text-ink border-t-2 border-t-primary' : 'border-transparent text-ink-muted hover:text-ink'"
        @click="tab = key"
      >
        {{ t(`settings.tabs.${key}`) }}
      </button>
    </div>

    <!-- ===== Basic ===== -->
    <template v-if="tab === 'basic'">
      <p class="mt-6 text-[14px] text-ink-muted">{{ t('settings.tabs.basicHint') }}</p>

      <section class="mt-6 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.sections.profile') }}</h2>
        <div class="mt-4 grid max-w-3xl grid-cols-[200px_1fr] items-center gap-x-6 gap-y-4 text-[14px]">
          <span class="text-ink-muted">{{ t('users.fields.fullName') }}</span>
          <span class="flex items-center gap-3 text-ink"><Avatar :name="auth.user?.fullName" size="sm" />{{ auth.user?.fullName }}</span>
          <span class="text-ink-muted">Email</span>
          <span class="text-ink">{{ auth.user?.email || '—' }}</span>
          <span class="text-ink-muted">{{ t('users.role') }}</span>
          <span class="text-ink">{{ roleLabel(auth.user?.role, { t, te }) }}</span>
          <span class="text-ink-muted">{{ t('settings.sections.language') }}</span>
          <div class="max-w-xs"><AppSelect :model-value="locale" :options="languageOptions" @update:model-value="onLocaleChange" /></div>
        </div>
      </section>

      <!-- Everyone who can reach this page came from the employee side and
           can go back to it; no role check needed. -->
      <section class="mt-6 border-t border-border pt-6">
        <PanelSwitchCard direction="user" />
      </section>

      <!-- SUPERADMIN only, like the rest of face verification: how often
           an employee has to prove who they are is not a course-editing
           decision, and there is no per-course override to soften it. -->
      <section v-if="auth.isSuperAdmin" class="mt-6 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.sections.security') }}</h2>
        <div class="mt-4 space-y-6">
          <SsoSettingsCard />
          <div>
            <h3 class="text-small font-semibold text-ink">{{ t('facePolicy.title') }}</h3>
            <p class="mt-1 text-caption text-ink-faint">{{ t('facePolicy.hint') }}</p>
            <div class="mt-4"><FacePolicyForm /></div>
          </div>
        </div>
      </section>
    </template>

    <!-- ===== Design ===== -->
    <template v-else-if="tab === 'design'">
      <p class="mt-6 text-[14px] text-ink-muted">{{ t('settings.tabs.designHint') }}</p>
      <section class="mt-6 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.sections.appearance') }}</h2>
        <div class="mt-4 grid max-w-3xl grid-cols-[200px_1fr] items-center gap-x-6 gap-y-4 text-[14px]">
          <span class="text-ink-muted">{{ t('settings.appearance.theme') }}</span>
          <div class="flex w-max gap-1.5 rounded-md border border-border p-1">
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
          <span class="text-ink-muted">{{ t('portal.brand') }}</span>
          <span class="text-ink">{{ t('portal.brand') }}</span>
        </div>
      </section>
    </template>

    <!-- ===== Features ===== -->
    <template v-else>
      <p class="mt-6 text-[14px] text-ink-muted">{{ t('settings.tabs.featuresHint') }}</p>

      <!-- Organisation-wide default. Individual courses can tighten or
           relax it from their own page; this is what they inherit. -->
      <section v-if="auth.hasPermission('course:read')" class="mt-6 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('attention.admin.title') }}</h2>
        <p class="mt-1 text-caption text-ink-faint">{{ t('attention.admin.globalHint') }}</p>
        <div class="mt-4"><AttentionPolicyForm :readonly="!auth.hasPermission('course:update')" /></div>
      </section>

      <!-- The AI budget (10.6), API keys (11.1) and webhooks: SUPERADMIN
           only, like the other platform-wide policies on this page. -->
      <template v-if="auth.isSuperAdmin">
        <section class="mt-6 border-t border-border pt-6"><AiSettingsCard /></section>
        <section class="mt-6 border-t border-border pt-6"><ApiKeysCard /></section>
        <section class="mt-6 border-t border-border pt-6"><WebhooksCard /></section>
      </template>
    </template>
  </div>
</template>

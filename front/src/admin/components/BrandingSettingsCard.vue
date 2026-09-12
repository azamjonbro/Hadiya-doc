<script setup>
/**
 * Settings → Design, as the reference lays it out (rasm): a colour scheme
 * (presets plus a custom colour), the logo and favicon, the covers of the
 * portal's pages and the login background, and the portal's top-bar menu
 * — which sections, in what order, which one opens first — with a small
 * live preview. Everything saves into the platform settings' `branding`
 * and applies through the branding store the moment it is saved.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { platformSettingsApi } from '@/services/platformSettings'
import { useBrandingStore } from '@/stores/branding'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { portalPrimaryNav } from '@/layouts/nav'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t } = useI18n()
const toast = useToast()
const branding = useBrandingStore()

const loading = ref(true)
const saving = ref(false)
const form = reactive({
  appName: '',
  primaryColor: '',
  logoUrl: '',
  faviconUrl: '',
  loginBackgroundUrl: '',
  coursesCoverUrl: '',
  catalogCoverUrl: '',
  profileCoverUrl: '',
  portalNav: [],
  startPage: '',
})

// The reference's swatches: white/grey, blue, indigo, teal, green, olive,
// orange, red, plus "custom".
const PRESETS = ['#347c1a', '#4cb726', '#2563eb', '#4f46e5', '#0d9488', '#d97706', '#dc2626', '#0f172a']

const navRows = computed(() => form.portalNav)
function ensureNav() {
  const known = new Map(form.portalNav.map((row) => [row.name, row]))
  form.portalNav = portalPrimaryNav.map((item) => known.get(item.name) ?? { name: item.name, enabled: true })
  // Sections arranged earlier keep their order; new ones append.
  const order = new Map(form.portalNav.map((row, i) => [row.name, i]))
  const saved = new Map([...known.keys()].map((name, i) => [name, i]))
  form.portalNav.sort((a, b) => (saved.get(a.name) ?? 100 + order.get(a.name)) - (saved.get(b.name) ?? 100 + order.get(b.name)))
}
function labelOf(name) {
  const item = portalPrimaryNav.find((i) => i.name === name)
  return item ? t(item.labelKey) : name
}
function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= form.portalNav.length) return
  const rows = [...form.portalNav]
  ;[rows[index], rows[target]] = [rows[target], rows[index]]
  form.portalNav = rows
}

async function load() {
  loading.value = true
  try {
    const settings = await platformSettingsApi.get()
    const b = settings.branding ?? {}
    Object.assign(form, {
      appName: b.appName ?? '',
      primaryColor: b.primaryColor ?? '',
      logoUrl: b.logoUrl ?? '',
      faviconUrl: b.faviconUrl ?? '',
      loginBackgroundUrl: b.loginBackgroundUrl ?? '',
      coursesCoverUrl: b.coursesCoverUrl ?? '',
      catalogCoverUrl: b.catalogCoverUrl ?? '',
      profileCoverUrl: b.profileCoverUrl ?? '',
      portalNav: (b.portalNav ?? []).map((row) => ({ name: row.name, enabled: row.enabled !== false })),
      startPage: b.startPage ?? '',
    })
    ensureNav()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const payload = {
      appName: form.appName.trim(),
      primaryColor: form.primaryColor || undefined,
      logoUrl: form.logoUrl,
      faviconUrl: form.faviconUrl,
      loginBackgroundUrl: form.loginBackgroundUrl,
      coursesCoverUrl: form.coursesCoverUrl,
      catalogCoverUrl: form.catalogCoverUrl,
      profileCoverUrl: form.profileCoverUrl,
      portalNav: form.portalNav.map((row) => ({ name: row.name, enabled: row.enabled })),
      startPage: form.startPage,
    }
    if (!form.primaryColor) delete payload.primaryColor
    const settings = await platformSettingsApi.update({ branding: payload })
    branding.set(settings.branding ?? payload)
    toast.success(t('settings.design.saved'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

const previewColor = computed(() => form.primaryColor || '#347c1a')
onMounted(load)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-[14px] text-ink-muted">{{ t('settings.design.hint') }}</p>
      <div class="flex items-center gap-2">
        <AppButton variant="outline" icon="eye" @click="$router.push('/')">{{ t('settings.design.openPortal') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </div>
    </div>

    <div v-if="loading" class="mt-6 space-y-3"><Skeleton v-for="i in 4" :key="i" class="h-16 w-full" /></div>

    <template v-else>
      <!-- Colour scheme -->
      <section class="mt-6 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.design.colorScheme') }}</h2>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('settings.design.colorHint') }}</p>
        <div class="mt-4 grid max-w-3xl grid-cols-[200px_1fr] items-center gap-x-6 gap-y-4 text-[14px]">
          <span class="text-ink-muted">{{ t('settings.design.colorScheme') }}</span>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="flex h-8 w-11 items-center justify-center rounded border-2 bg-surface text-[11px] text-ink-muted"
              :class="!form.primaryColor ? 'border-primary' : 'border-border'"
              :title="t('settings.design.defaultColor')"
              @click="form.primaryColor = ''"
            >
              <span class="h-4 w-7 rounded-sm" style="background: rgb(52 124 26)" />
            </button>
            <button
              v-for="color in PRESETS"
              :key="color"
              type="button"
              class="h-8 w-11 rounded border-2 p-1"
              :class="form.primaryColor.toLowerCase() === color ? 'border-primary' : 'border-border'"
              :aria-label="color"
              @click="form.primaryColor = color"
            >
              <span class="block h-full w-full rounded-sm" :style="{ background: color }" />
            </button>
            <label class="flex h-8 items-center gap-2 rounded border border-border px-2 text-caption text-ink-muted">
              <Icon name="pencil" size="13" />
              <input v-model="form.primaryColor" type="color" class="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" :aria-label="t('settings.design.customColor')" />
              <span class="font-mono">{{ form.primaryColor || '—' }}</span>
            </label>
          </div>
          <span class="text-ink-muted">{{ t('settings.design.appName') }}</span>
          <AppInput v-model="form.appName" class="max-w-sm" :placeholder="t('portal.brand')" :aria-label="t('settings.design.appName')" />
        </div>
      </section>

      <!-- Logo -->
      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.design.logo') }}</h2>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('settings.design.logoHint') }}</p>
        <div class="mt-4 grid max-w-3xl grid-cols-[200px_1fr] items-start gap-x-6 gap-y-5 text-[14px]">
          <span class="pt-2 text-ink-muted">{{ t('settings.design.logo') }}</span>
          <div class="flex flex-wrap items-start gap-4">
            <div class="w-52"><ImageUploadField v-model="form.logoUrl" aspect="aspect-[3/1]" /></div>
            <p class="max-w-xs text-caption text-ink-faint">{{ t('settings.design.logoFormat') }}</p>
          </div>
          <span class="pt-2 text-ink-muted">{{ t('settings.design.favicon') }}</span>
          <div class="flex flex-wrap items-start gap-4">
            <div class="w-16"><ImageUploadField v-model="form.faviconUrl" aspect="aspect-square" /></div>
            <p class="max-w-xs text-caption text-ink-faint">{{ t('settings.design.faviconFormat') }}</p>
          </div>
        </div>
      </section>

      <!-- Covers -->
      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.design.covers') }}</h2>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('settings.design.coversHint') }}</p>
        <div class="mt-4 grid max-w-3xl grid-cols-[200px_1fr] items-start gap-x-6 gap-y-5 text-[14px]">
          <template v-for="key in ['coursesCoverUrl', 'catalogCoverUrl', 'profileCoverUrl', 'loginBackgroundUrl']" :key="key">
            <span class="pt-2 text-ink-muted">{{ t(`settings.design.cover.${key}`) }}</span>
            <div class="flex flex-wrap items-start gap-4">
              <div class="w-64"><ImageUploadField v-model="form[key]" aspect="aspect-video" /></div>
              <p class="max-w-xs text-caption text-ink-faint">{{ t('settings.design.coverFormat') }}</p>
            </div>
          </template>
        </div>
      </section>

      <!-- Portal navigation -->
      <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-[18px] font-medium text-ink">{{ t('settings.design.nav') }}</h2>
        <p class="mt-1 text-[13px] text-ink-muted">{{ t('settings.design.navHint') }}</p>
        <div class="mt-4 grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <ul class="divide-y divide-border rounded-lg border border-border">
            <li v-for="(row, index) in navRows" :key="row.name" class="flex items-center gap-3 px-3 py-2.5 text-[14px]">
              <span class="flex flex-col text-ink-faint">
                <button type="button" class="leading-none hover:text-ink disabled:opacity-30" :disabled="index === 0" :aria-label="t('common.moveUp')" @click="move(index, -1)"><Icon name="chevron-up" size="12" /></button>
                <button type="button" class="leading-none hover:text-ink disabled:opacity-30" :disabled="index === navRows.length - 1" :aria-label="t('common.moveDown')" @click="move(index, 1)"><Icon name="chevron-down" size="12" /></button>
              </span>
              <input v-model="row.enabled" type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :aria-label="labelOf(row.name)" />
              <span class="flex-1 text-ink" :class="row.enabled ? '' : 'text-ink-faint line-through'">{{ labelOf(row.name) }}</span>
              <button
                type="button"
                class="rounded-full border px-2 py-0.5 text-caption transition-default"
                :class="form.startPage === row.name ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-faint hover:text-ink'"
                @click="form.startPage = form.startPage === row.name ? '' : row.name"
              >
                {{ t('settings.design.startPage') }}
              </button>
            </li>
          </ul>

          <!-- Preview: the top bar as it would look -->
          <div class="overflow-hidden rounded-lg border border-border">
            <div class="flex h-12 items-center gap-4 px-4 text-white" :style="{ background: previewColor }">
              <img v-if="form.logoUrl" :src="form.logoUrl" alt="" class="h-7 max-w-[120px] object-contain" />
              <span v-else class="text-[18px] font-black uppercase tracking-tighter">{{ form.appName || t('portal.brand') }}</span>
              <span class="ml-auto flex items-center gap-3 text-[12px]">
                <span v-for="row in navRows.filter((r) => r.enabled)" :key="row.name" class="opacity-90">{{ labelOf(row.name) }}</span>
              </span>
            </div>
            <div class="h-24 bg-surface-2" :style="form.coursesCoverUrl ? { backgroundImage: `url('${form.coursesCoverUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined" />
            <div class="space-y-2 p-4">
              <div class="h-3 w-1/2 rounded bg-surface-2" />
              <div class="h-3 w-1/3 rounded bg-surface-2" />
              <span class="inline-block rounded-md px-3 py-1 text-[12px] text-white" :style="{ background: previewColor }">{{ t('common.save') }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

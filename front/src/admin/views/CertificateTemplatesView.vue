<script setup>
/**
 * Certificate templates, and the certificates they produced.
 *
 * The position editor is the reason this page exists rather than a form:
 * HR hands over a background image and then wants the name nudged two
 * centimetres left, which is a thing you do by dragging, not by typing
 * coordinates. Fields are stored as page percentages (see the model), so
 * what is dragged here survives the background being swapped for one of a
 * different size.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { certificatesApi } from '@/services/certificates'
import { uploadsApi } from '@/services/uploads'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const FIELD_KEYS = ['fullName', 'courseTitle', 'issuedAt', 'validUntil', 'serial', 'score', 'qr']

const tab = ref('templates')
const templates = ref([])
const loadingTemplates = ref(true)
const saving = ref(false)
const uploading = ref(false)

const issued = ref([])
const loadingIssued = ref(false)
const issuedStatus = ref('')
const issuedSearch = ref('')
const nextCursor = ref(null)

// The template currently open in the editor. A local copy, so an abandoned
// edit does not leave the list showing changes that were never saved.
const draft = ref(null)
const selectedFieldIndex = ref(-1)
const canvas = ref(null)
const dragging = ref(null)

const statusVariant = { VALID: 'success', EXPIRED: 'warning', REVOKED: 'danger' }

const tabs = computed(() => [
  { value: 'templates', label: t('certTemplates.tabs.templates'), count: templates.value.length },
  { value: 'issued', label: t('certTemplates.tabs.issued') },
])

const selectedField = computed(() =>
  selectedFieldIndex.value >= 0 ? draft.value?.fields[selectedFieldIndex.value] : null
)

// Landscape and portrait A4 have the same ratio, one inverted — the preview
// has to match or a field dragged to the corner lands somewhere else on the
// PDF.
const canvasAspect = computed(() =>
  draft.value?.orientation === 'portrait' ? 'aspect-[210/297]' : 'aspect-[297/210]'
)

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}

function sampleFor(key) {
  switch (key) {
    case 'fullName':
      return t('certTemplates.sample.fullName')
    case 'courseTitle':
      return t('certTemplates.sample.courseTitle')
    case 'issuedAt':
      return '2026-09-08'
    case 'validUntil':
      return '2027-09-08'
    case 'serial':
      return '2026-ABCDE-FGHJK'
    case 'score':
      return '92%'
    default:
      return ''
  }
}

async function loadTemplates() {
  loadingTemplates.value = true
  try {
    templates.value = await certificatesApi.templates()
  } catch (error) {
    toast.error(apiErrorText(error, t('certTemplates.loadError')))
  } finally {
    loadingTemplates.value = false
  }
}

async function loadIssued({ append = false } = {}) {
  loadingIssued.value = true
  try {
    const result = await certificatesApi.list({
      status: issuedStatus.value || undefined,
      search: issuedSearch.value || undefined,
      limit: 50,
      cursor: append ? nextCursor.value : undefined,
    })
    issued.value = append ? [...issued.value, ...result.items] : result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    toast.error(apiErrorText(error, t('certTemplates.loadError')))
  } finally {
    loadingIssued.value = false
  }
}

function newTemplate() {
  draft.value = {
    name: '',
    backgroundKey: '',
    backgroundUrl: '',
    orientation: 'landscape',
    pageSize: 'A4',
    validityDays: 0,
    isDefault: false,
    // The same starting layout the renderer falls back to, so a brand new
    // template already looks like a certificate before anything is dragged.
    fields: [
      { key: 'fullName', x: 50, y: 42, fontSize: 30, bold: true, align: 'center', color: '#111111' },
      { key: 'courseTitle', x: 50, y: 55, fontSize: 18, bold: false, align: 'center', color: '#111111' },
      { key: 'issuedAt', x: 50, y: 68, fontSize: 12, bold: false, align: 'center', color: '#111111' },
      { key: 'serial', x: 50, y: 90, fontSize: 9, bold: false, align: 'center', color: '#666666' },
      { key: 'qr', x: 88, y: 72, size: 10 },
    ],
  }
  selectedFieldIndex.value = 0
}

function edit(template) {
  draft.value = JSON.parse(JSON.stringify(template))
  selectedFieldIndex.value = draft.value.fields.length ? 0 : -1
}

function closeEditor() {
  draft.value = null
  selectedFieldIndex.value = -1
}

async function uploadBackground(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    const { url, key } = await uploadsApi.image(file)
    draft.value.backgroundKey = key
    draft.value.backgroundUrl = url
  } catch (error) {
    toast.error(apiErrorText(error, t('certTemplates.uploadError')))
  } finally {
    uploading.value = false
  }
}

function addField(key) {
  if (draft.value.fields.some((field) => field.key === key)) return
  draft.value.fields.push(
    key === 'qr'
      ? { key, x: 50, y: 50, size: 10 }
      : { key, x: 50, y: 50, fontSize: 16, bold: false, align: 'center', color: '#111111' }
  )
  selectedFieldIndex.value = draft.value.fields.length - 1
}

function removeField(index) {
  draft.value.fields.splice(index, 1)
  selectedFieldIndex.value = Math.min(selectedFieldIndex.value, draft.value.fields.length - 1)
}

function startDrag(index, event) {
  selectedFieldIndex.value = index
  dragging.value = index
  event.preventDefault()
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function onDrag(event) {
  if (dragging.value === null || !canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const field = draft.value.fields[dragging.value]
  // Clamped: a field dragged off the page would be stored as a coordinate
  // the renderer draws outside the paper, which reads as a missing field.
  field.x = Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)))
  field.y = Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)))
}

function endDrag() {
  dragging.value = null
  window.removeEventListener('pointermove', onDrag)
}

// Arrow keys for the last percent, which is the part that is impossible to
// hit with a mouse and the part people care about once the layout is close.
function nudge(dx, dy) {
  const field = selectedField.value
  if (!field) return
  field.x = Math.min(100, Math.max(0, field.x + dx))
  field.y = Math.min(100, Math.max(0, field.y + dy))
}

async function save() {
  if (!draft.value.name.trim()) {
    toast.error(t('certTemplates.nameRequired'))
    return
  }
  saving.value = true
  try {
    const payload = {
      name: draft.value.name.trim(),
      backgroundKey: draft.value.backgroundKey ?? '',
      orientation: draft.value.orientation,
      pageSize: draft.value.pageSize,
      validityDays: Number(draft.value.validityDays) || 0,
      isDefault: Boolean(draft.value.isDefault),
      fields: draft.value.fields,
    }
    if (draft.value._id) await certificatesApi.updateTemplate(draft.value._id, payload)
    else await certificatesApi.createTemplate(payload)
    toast.success(t('certTemplates.saved'))
    closeEditor()
    await loadTemplates()
  } catch (error) {
    toast.error(apiErrorText(error, t('certTemplates.saveError')))
  } finally {
    saving.value = false
  }
}

async function removeTemplate(template) {
  const ok = await confirm({
    title: t('certTemplates.deleteTitle'),
    message: t('certTemplates.deleteMessage', { name: template.name }),
  })
  if (!ok) return
  try {
    await certificatesApi.deleteTemplate(template._id)
    toast.success(t('certTemplates.deleted'))
    await loadTemplates()
  } catch (error) {
    // The server refuses while certificates point at it. Surfaced as the
    // server's own message, which says why.
    toast.error(apiErrorText(error, t('certTemplates.deleteError')))
  }
}

async function revoke(certificate) {
  const ok = await confirm({
    title: t('certTemplates.revokeTitle'),
    message: t('certTemplates.revokeMessage', { name: certificate.fullName }),
  })
  if (!ok) return
  try {
    await certificatesApi.revoke(certificate.id, '')
    toast.success(t('certTemplates.revoked'))
    await loadIssued()
  } catch (error) {
    toast.error(apiErrorText(error, t('certTemplates.revokeError')))
  }
}

function switchTab(value) {
  tab.value = value
  if (value === 'issued' && !issued.value.length) loadIssued()
}

onMounted(loadTemplates)
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-[28px] font-bold text-ink">{{ t('certTemplates.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('certTemplates.subtitle') }}</p>
      </div>
      <AppButton v-if="tab === 'templates' && !draft" icon="plus" @click="newTemplate">
        {{ t('certTemplates.new') }}
      </AppButton>
    </div>

    <Tabs v-if="!draft" :model-value="tab" :tabs="tabs" class="mt-6" @update:model-value="switchTab" />

    <!-- Template list -->
    <div v-if="tab === 'templates' && !draft" class="mt-6">
      <div v-if="loadingTemplates" class="space-y-3">
        <Skeleton v-for="n in 3" :key="n" class="h-20 w-full rounded-xl" />
      </div>
      <EmptyState
        v-else-if="!templates.length"
        icon="award"
        :title="t('certTemplates.emptyTitle')"
        :description="t('certTemplates.emptyDescription')"
      />
      <div v-else class="space-y-3">
        <AppCard v-for="template in templates" :key="template._id" class="flex items-center justify-between gap-4 p-4">
          <div class="flex min-w-0 items-center gap-4">
            <div class="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
              <img v-if="template.backgroundUrl" :src="template.backgroundUrl" class="h-full w-full object-cover" alt="" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium text-ink">{{ template.name }}</p>
                <Badge v-if="template.isDefault" variant="primary" size="sm">{{ t('certTemplates.default') }}</Badge>
              </div>
              <p class="mt-0.5 text-small text-ink-muted">
                {{ t(`certTemplates.orientation.${template.orientation}`) }} ·
                {{ template.fields.length }} {{ t('certTemplates.fieldsCount') }} ·
                {{
                  template.validityDays
                    ? t('certTemplates.validFor', { days: template.validityDays })
                    : t('certTemplates.neverExpires')
                }}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <AppButton variant="secondary" size="sm" icon="pencil" @click="edit(template)">
              {{ t('certTemplates.edit') }}
            </AppButton>
            <AppButton variant="ghost" size="sm" icon="trash" @click="removeTemplate(template)" />
          </div>
        </AppCard>
      </div>
    </div>

    <!-- Issued certificates -->
    <div v-if="tab === 'issued' && !draft" class="mt-6">
      <div class="flex flex-wrap gap-3">
        <AppInput
          v-model="issuedSearch"
          class="w-64"
          icon="search"
          :placeholder="t('certTemplates.searchPlaceholder')"
          @keyup.enter="loadIssued()"
        />
        <AppSelect
          v-model="issuedStatus"
          class="w-44"
          :options="[
            { value: '', label: t('certTemplates.allStatuses') },
            { value: 'VALID', label: t('certificates.status.VALID') },
            { value: 'EXPIRED', label: t('certificates.status.EXPIRED') },
            { value: 'REVOKED', label: t('certificates.status.REVOKED') },
          ]"
          @update:model-value="loadIssued()"
        />
      </div>

      <div v-if="loadingIssued && !issued.length" class="mt-4 space-y-2">
        <Skeleton v-for="n in 5" :key="n" class="h-14 w-full rounded-lg" />
      </div>
      <EmptyState
        v-else-if="!issued.length"
        icon="award"
        :title="t('certTemplates.noneIssuedTitle')"
        :description="t('certTemplates.noneIssuedDescription')"
      />
      <AppCard v-else class="mt-4 overflow-x-auto p-0">
        <table class="w-full text-small">
          <thead class="border-b border-border text-left text-ink-muted">
            <tr>
              <th class="px-4 py-3 font-medium">{{ t('certTemplates.holder') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('certificates.title') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('certificates.serial') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('certificates.issuedAt') }}</th>
              <th class="px-4 py-3 font-medium">{{ t('certTemplates.status') }}</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="certificate in issued" :key="certificate.id" class="border-b border-border last:border-0">
              <td class="px-4 py-3 text-ink">{{ certificate.fullName }}</td>
              <td class="px-4 py-3 text-ink-muted">{{ certificate.title }}</td>
              <td class="px-4 py-3 font-mono text-ink-muted">{{ certificate.serial }}</td>
              <td class="px-4 py-3 text-ink-muted">{{ formatDate(certificate.issuedAt) }}</td>
              <td class="px-4 py-3">
                <Badge :variant="statusVariant[certificate.status]" size="sm">
                  {{ t(`certificates.status.${certificate.status}`) }}
                </Badge>
              </td>
              <td class="px-4 py-3 text-right">
                <AppButton
                  v-if="certificate.status !== 'REVOKED'"
                  variant="ghost"
                  size="sm"
                  @click="revoke(certificate)"
                >
                  {{ t('certTemplates.revoke') }}
                </AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </AppCard>
      <div v-if="nextCursor" class="mt-4 text-center">
        <AppButton variant="secondary" :loading="loadingIssued" @click="loadIssued({ append: true })">
          {{ t('certTemplates.loadMore') }}
        </AppButton>
      </div>
    </div>

    <!-- Position editor -->
    <div v-if="draft" class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <AppCard class="p-4">
        <div
          ref="canvas"
          class="relative w-full select-none overflow-hidden rounded-lg border border-border bg-white"
          :class="canvasAspect"
        >
          <img
            v-if="draft.backgroundUrl"
            :src="draft.backgroundUrl"
            class="pointer-events-none absolute inset-0 h-full w-full object-fill"
            alt=""
          />
          <div
            v-for="(field, index) in draft.fields"
            :key="field.key"
            class="absolute cursor-move whitespace-nowrap rounded px-1"
            :class="index === selectedFieldIndex ? 'outline outline-2 outline-primary' : 'hover:outline hover:outline-1 hover:outline-border-strong'"
            :style="{
              left: `${field.x}%`,
              top: `${field.y}%`,
              transform: 'translate(-50%, -50%)',
              color: field.color ?? '#111111',
              fontWeight: field.bold ? 700 : 400,
              // Font sizes are points on an A4 page; the preview is a
              // fraction of that width, so they are scaled the same way
              // rather than shown at their literal pixel size.
              fontSize: field.key === 'qr' ? undefined : `${(field.fontSize ?? 16) * 0.9}px`,
            }"
            @pointerdown="startDrag(index, $event)"
          >
            <div
              v-if="field.key === 'qr'"
              class="flex items-center justify-center border border-dashed border-ink-faint bg-white/70 text-ink-faint"
              :style="{ width: `${field.size ?? 10}%`, aspectRatio: '1' }"
            >
              <Icon name="grid" size="16" />
            </div>
            <template v-else>{{ sampleFor(field.key) }}</template>
          </div>
        </div>
        <p class="mt-3 text-caption text-ink-faint">{{ t('certTemplates.dragHint') }}</p>
      </AppCard>

      <div class="space-y-4">
        <AppCard class="space-y-3 p-4">
          <AppInput v-model="draft.name" :label="t('certTemplates.name')" required />
          <AppSelect
            v-model="draft.orientation"
            :label="t('certTemplates.orientationLabel')"
            :options="[
              { value: 'landscape', label: t('certTemplates.orientation.landscape') },
              { value: 'portrait', label: t('certTemplates.orientation.portrait') },
            ]"
          />
          <AppInput
            v-model="draft.validityDays"
            type="number"
            :label="t('certTemplates.validityDays')"
            :hint="t('certTemplates.validityHint')"
          />
          <label class="flex items-center gap-2 text-small text-ink">
            <input v-model="draft.isDefault" type="checkbox" class="h-4 w-4 rounded border-border" />
            {{ t('certTemplates.makeDefault') }}
          </label>
          <div>
            <p class="mb-1.5 text-small text-ink-muted">{{ t('certTemplates.background') }}</p>
            <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-small text-ink hover:bg-surface-hover">
              <Icon :name="uploading ? 'loader' : 'upload'" size="16" :class="uploading ? 'animate-spin' : ''" />
              {{ draft.backgroundUrl ? t('certTemplates.replaceBackground') : t('certTemplates.uploadBackground') }}
              <input type="file" accept="image/*" class="hidden" @change="uploadBackground" />
            </label>
          </div>
        </AppCard>

        <AppCard class="p-4">
          <p class="text-small font-medium text-ink">{{ t('certTemplates.fields') }}</p>
          <div class="mt-3 space-y-1">
            <button
              v-for="(field, index) in draft.fields"
              :key="field.key"
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-small transition-default"
              :class="index === selectedFieldIndex ? 'bg-primary-subtle text-primary' : 'text-ink hover:bg-surface-hover'"
              @click="selectedFieldIndex = index"
            >
              <span>{{ t(`certTemplates.field.${field.key}`) }}</span>
              <span class="flex items-center gap-2">
                <span class="text-caption text-ink-faint">{{ field.x }}% · {{ field.y }}%</span>
                <Icon name="trash" size="14" @click.stop="removeField(index)" />
              </span>
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            <button
              v-for="key in FIELD_KEYS.filter((k) => !draft.fields.some((f) => f.key === k))"
              :key="key"
              type="button"
              class="rounded-full border border-border px-2.5 py-1 text-caption text-ink-muted hover:bg-surface-hover"
              @click="addField(key)"
            >
              + {{ t(`certTemplates.field.${key}`) }}
            </button>
          </div>
        </AppCard>

        <AppCard v-if="selectedField" class="space-y-3 p-4">
          <p class="text-small font-medium text-ink">
            {{ t(`certTemplates.field.${selectedField.key}`) }}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <AppInput v-model.number="selectedField.x" type="number" label="X %" />
            <AppInput v-model.number="selectedField.y" type="number" label="Y %" />
          </div>
          <div class="flex items-center gap-1">
            <AppButton variant="ghost" size="sm" @click="nudge(-1, 0)">←</AppButton>
            <AppButton variant="ghost" size="sm" @click="nudge(0, -1)">↑</AppButton>
            <AppButton variant="ghost" size="sm" @click="nudge(0, 1)">↓</AppButton>
            <AppButton variant="ghost" size="sm" @click="nudge(1, 0)">→</AppButton>
          </div>
          <template v-if="selectedField.key === 'qr'">
            <AppInput v-model.number="selectedField.size" type="number" :label="t('certTemplates.qrSize')" />
          </template>
          <template v-else>
            <AppInput v-model.number="selectedField.fontSize" type="number" :label="t('certTemplates.fontSize')" />
            <AppSelect
              v-model="selectedField.align"
              :label="t('certTemplates.align')"
              :options="[
                { value: 'left', label: t('certTemplates.alignLeft') },
                { value: 'center', label: t('certTemplates.alignCenter') },
                { value: 'right', label: t('certTemplates.alignRight') },
              ]"
            />
            <label class="flex items-center gap-2 text-small text-ink">
              <input v-model="selectedField.bold" type="checkbox" class="h-4 w-4 rounded border-border" />
              {{ t('certTemplates.bold') }}
            </label>
            <label class="flex items-center gap-2 text-small text-ink">
              {{ t('certTemplates.color') }}
              <input v-model="selectedField.color" type="color" class="h-7 w-12 rounded border border-border" />
            </label>
          </template>
        </AppCard>

        <div class="flex gap-2">
          <AppButton :loading="saving" @click="save">{{ t('certTemplates.save') }}</AppButton>
          <AppButton variant="secondary" @click="closeEditor">{{ t('certTemplates.cancel') }}</AppButton>
        </div>
      </div>
    </div>
  </div>
</template>

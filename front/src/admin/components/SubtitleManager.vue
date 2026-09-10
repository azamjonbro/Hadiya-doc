<script setup>
/**
 * Caption tracks for one video.
 *
 * Kept deliberately plain: pick a file, say which language it is, done. The
 * server converts SRT to WebVTT and reads the cue count, so there is
 * nothing here for an author to get wrong beyond the language — and that is
 * a field rather than a guess because a mislabelled track is worse than a
 * missing one (the viewer turns on "Russian" and gets Uzbek).
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { videosApi } from '@/services/videos'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ videoId: { type: String, required: true } })
const emit = defineEmits(['changed'])

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const tracks = ref([])
const loading = ref(true)
const uploading = ref(false)
const file = ref(null)
const lang = ref('uz')
const label = ref('')
const fileInput = ref(null)

// The three the platform itself speaks, plus a free-text field for anything
// else — a course bought from outside can arrive with any language.
const LANGUAGES = computed(() => [
  { value: 'uz', label: t('subtitles.langUz') },
  { value: 'ru', label: t('subtitles.langRu') },
  { value: 'en', label: t('subtitles.langEn') },
  { value: 'other', label: t('subtitles.langOther') },
])
const customLang = ref('')

async function load() {
  loading.value = true
  try {
    tracks.value = await videosApi.listSubtitles(props.videoId)
  } catch (error) {
    toast.error(apiErrorText(error, t('subtitles.loadFailed')))
  } finally {
    loading.value = false
  }
}

function pick(event) {
  const selected = event.target.files?.[0]
  event.target.value = ''
  if (!selected) return
  file.value = selected
  if (!label.value) label.value = selected.name.replace(/\.(vtt|srt)$/i, '')
}

async function upload() {
  if (!file.value || uploading.value) return
  const language = lang.value === 'other' ? customLang.value.trim() : lang.value
  if (!language) {
    toast.error(t('subtitles.langRequired'))
    return
  }
  uploading.value = true
  try {
    tracks.value = await videosApi.addSubtitle(props.videoId, {
      file: file.value,
      lang: language,
      label: label.value.trim(),
    })
    file.value = null
    label.value = ''
    emit('changed', tracks.value)
    toast.success(t('subtitles.added'))
  } catch (error) {
    toast.error(apiErrorText(error, t('subtitles.addFailed')))
  } finally {
    uploading.value = false
  }
}

async function makeDefault(track) {
  try {
    tracks.value = await videosApi.setDefaultSubtitle(props.videoId, track.id)
    emit('changed', tracks.value)
  } catch (error) {
    toast.error(apiErrorText(error, t('subtitles.updateFailed')))
  }
}

async function remove(track) {
  if (!(await confirm.ask({ message: t('subtitles.confirmDelete', { lang: track.label || track.lang }) }))) return
  try {
    tracks.value = await videosApi.removeSubtitle(props.videoId, track.id)
    emit('changed', tracks.value)
  } catch (error) {
    toast.error(apiErrorText(error, t('subtitles.removeFailed')))
  }
}

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface-2 p-4">
    <p class="text-small font-semibold text-ink">{{ t('subtitles.title') }}</p>
    <p class="mt-0.5 text-caption text-ink-faint">{{ t('subtitles.hint') }}</p>

    <p v-if="loading" class="mt-2 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <ul v-else-if="tracks.length" class="mt-2 divide-y divide-border">
      <li v-for="track in tracks" :key="track.id" class="flex items-center gap-2 py-2">
        <Icon name="message-square" size="14" class="shrink-0 text-ink-faint" />
        <span class="min-w-0 flex-1 truncate text-small text-ink">
          {{ track.label || track.lang }}
          <span class="text-ink-faint">· {{ track.lang }} · {{ t('subtitles.cueCount', { count: track.cueCount }) }}</span>
        </span>
        <Badge v-if="track.source === 'EMBEDDED'" variant="neutral" size="sm">{{ t('subtitles.embedded') }}</Badge>
        <Badge v-if="track.isDefault" variant="success" size="sm">{{ t('subtitles.default') }}</Badge>
        <AppButton v-else variant="ghost" size="sm" @click="makeDefault(track)">
          {{ t('subtitles.makeDefault') }}
        </AppButton>
        <AppButton variant="ghost" size="sm" icon="trash" @click="remove(track)" />
      </li>
    </ul>

    <p v-else class="mt-2 text-caption text-ink-faint">{{ t('subtitles.empty') }}</p>

    <div class="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <input ref="fileInput" type="file" accept=".vtt,.srt,text/vtt" class="hidden" @change="pick" />
      <AppButton variant="ghost" size="sm" icon="upload" @click="fileInput?.click()">
        {{ file ? file.name : t('subtitles.chooseFile') }}
      </AppButton>
      <AppSelect v-model="lang" class="w-36" :options="LANGUAGES" />
      <AppInput v-if="lang === 'other'" v-model="customLang" class="w-24" placeholder="fr, de-AT…" />
      <AppInput v-model="label" class="w-40" :placeholder="t('subtitles.labelPlaceholder')" />
      <AppButton size="sm" :disabled="!file" :loading="uploading" @click="upload">
        {{ t('subtitles.add') }}
      </AppButton>
    </div>
  </div>
</template>

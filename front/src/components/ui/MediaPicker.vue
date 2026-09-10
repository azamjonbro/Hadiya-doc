<script setup>
/**
 * Pick an image that has already been uploaded.
 *
 * The point of the library (9.5): the company logo, the safety diagram that
 * belongs in four lessons, the branch photo — all of them used to be
 * uploaded once per place they appeared, because there was no way to find
 * the one already in storage.
 */
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mediaApi } from '@/services/media'
import { apiErrorText } from '@/utils/apiError'
import Modal from './Modal.vue'
import AppInput from './AppInput.vue'
import AppSelect from './AppSelect.vue'
import Skeleton from './Skeleton.vue'
import Icon from './Icon.vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'pick'])

const { t } = useI18n()
const items = ref([])
const folders = ref([])
const folder = ref('')
const search = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [page, folderNames] = await Promise.all([
      mediaApi.list({ folder: folder.value || undefined, search: search.value || undefined, limit: 40 }),
      mediaApi.folders(),
    ])
    items.value = page.items
    folders.value = folderNames
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('media.loadFailed'))
  } finally {
    loading.value = false
  }
}

// Reloaded when the dialog opens rather than kept warm: somebody else may
// have uploaded something since this page was rendered.
watch(() => props.open, (open) => open && load())
onMounted(() => props.open && load())

let debounce = null
watch(search, () => {
  if (debounce) window.clearTimeout(debounce)
  debounce = window.setTimeout(load, 300)
})
watch(folder, load)
</script>

<template>
  <Modal
    :model-value="open"
    :title="t('media.pickTitle')"
    size="lg"
    @update:model-value="(value) => !value && emit('close')"
  >
    <div class="flex flex-wrap gap-2">
      <AppInput v-model="search" class="min-w-0 flex-1" :placeholder="t('media.search')" />
      <AppSelect
        v-model="folder"
        class="w-44"
        :options="[{ value: '', label: t('media.allFolders') }, ...folders.map((name) => ({ value: name, label: name }))]"
      />
    </div>

    <div v-if="loading" class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
      <Skeleton v-for="index in 8" :key="index" class="aspect-square rounded-lg" />
    </div>

    <p v-else-if="errorMessage" class="mt-3 text-small text-danger">{{ errorMessage }}</p>

    <p v-else-if="!items.length" class="mt-4 text-small text-ink-faint">{{ t('media.empty') }}</p>

    <div v-else class="mt-3 grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="group overflow-hidden rounded-lg border border-border text-left transition-default hover:border-primary"
        @click="emit('pick', item)"
      >
        <span class="block aspect-square bg-surface-2">
          <img :src="item.thumbUrl || item.url" :alt="item.name" class="h-full w-full object-cover" loading="lazy" />
        </span>
        <span class="flex items-center gap-1 px-2 py-1.5">
          <Icon name="image" size="12" class="shrink-0 text-ink-faint" />
          <span class="truncate text-caption text-ink">{{ item.name || item.key.slice(-12) }}</span>
        </span>
      </button>
    </div>
  </Modal>
</template>

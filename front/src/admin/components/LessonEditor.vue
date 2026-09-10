<script setup>
/**
 * The block editor.
 *
 * Three decisions shape it:
 *
 * 1. **Autosave, not a save button.** A lesson is written over several
 *    sittings and a block editor has no natural moment to press save — the
 *    author is always mid-paragraph. So every change schedules a write a
 *    second after the last keystroke, and the header says what state that
 *    write is in. Publishing stays a button: it is a decision, not a typo.
 *
 * 2. **Ids come back and stay.** Reading progress is recorded against block
 *    ids, so a save must not hand every block a new one. The server keeps
 *    the ids it is given; this component merges the ids of newly created
 *    blocks back into the local array instead of replacing the array, which
 *    would also throw away the caret of whoever is typing.
 *
 * 3. **The preview renders through the reader's own component.** A preview
 *    with its own markup is a preview that eventually lies.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { lessonsApi } from '@/services/lessons'
import { topicsApi } from '@/services/topics'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import RichText from '@/components/ui/RichText.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import SortableList from '@/components/ui/SortableList.vue'
import LessonBlock from '@/components/lesson/LessonBlock.vue'
import {
  BLOCK_TYPES,
  CALLOUT_VARIANTS,
  adoptIds,
  emptyBlock,
  isComplete,
  serializeBlock,
} from '@/utils/lessonBlocks'

const props = defineProps({
  lessonId: { type: String, required: true },
  topicId: { type: String, required: true },
})
const emit = defineEmits(['updated', 'removed'])

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const loading = ref(true)
const saving = ref(false)
const removing = ref(false)
const savedAt = ref(null)
const errorMessage = ref('')
const previewing = ref(false)
const status = ref('DRAFT')
const courseId = ref('')

const form = reactive({ title: '', description: '', estimatedMinutes: 0, required: true })
const blocks = ref([])

// Content of this topic a VIDEO or FILE block can point at. Loaded once with
// the lesson: the backend only allows references inside the same course, and
// offering a picker of everything would suggest otherwise.
const topicVideos = ref([])
const topicMaterials = ref([])

// A local key for v-for and drag-drop, handed to emptyBlock(). A block has
// no id until it has been saved once, and keying on the array index makes a
// reorder rebuild every row — which loses the caret of whoever is typing.
let keySeed = 0
const nextKey = () => `b${(keySeed += 1)}`

function addBlock(type) {
  blocks.value = [
    ...blocks.value,
    emptyBlock(type, {
      key: nextKey(),
      // A picker with one option should arrive already chosen.
      videoId: topicVideos.value[0]?.id ?? '',
      materialId: topicMaterials.value[0]?.id ?? '',
    }),
  ]
}

function removeBlock(index) {
  blocks.value = blocks.value.filter((_, position) => position !== index)
}

function duplicateBlock(index) {
  const copy = { ...structuredClone(serializeBlock(blocks.value[index])), _key: nextKey() }
  // The copy is a new block, so it must not carry the original's id — that
  // id is where somebody's reading progress points.
  delete copy.id
  blocks.value = [...blocks.value.slice(0, index + 1), copy, ...blocks.value.slice(index + 1)]
}

/** Table editing works on whole rows and columns, never on single cells. */
function addRow(block) {
  block.rows = [...block.rows, Array(block.rows[0]?.length ?? 2).fill('')]
}
function addColumn(block) {
  if ((block.rows[0]?.length ?? 0) >= 12) return
  block.rows = block.rows.map((row) => [...row, ''])
}
function removeRow(block, index) {
  if (block.rows.length <= 1) return
  block.rows = block.rows.filter((_, position) => position !== index)
}
function removeColumn(block, index) {
  if ((block.rows[0]?.length ?? 0) <= 1) return
  block.rows = block.rows.map((row) => row.filter((_, position) => position !== index))
}

function addGalleryItem(block) {
  block.items = [...block.items, { url: '', alt: '', caption: '' }]
}
function removeGalleryItem(block, index) {
  if (block.items.length <= 1) return
  block.items = block.items.filter((_, position) => position !== index)
}

const pendingBlocks = computed(() => blocks.value.filter((block) => !isComplete(block)).length)

// Autosave is off while the lesson is being loaded into the form — otherwise
// filling the fields would immediately schedule a write of what was just
// read.
let hydrating = true
let saveTimer = null

function scheduleSave() {
  if (hydrating) return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(save, 1200)
}

async function save() {
  if (saveTimer) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  if (hydrating) return
  saving.value = true
  errorMessage.value = ''
  const sent = blocks.value.filter(isComplete)
  try {
    const updated = await lessonsApi.update(props.lessonId, {
      title: form.title.trim() || t('lesson.untitled'),
      description: form.description,
      estimatedMinutes: Number(form.estimatedMinutes) || 0,
      required: form.required,
      blocks: sent.map(serializeBlock),
    })
    adoptIds(sent, updated.blocks)
    status.value = updated.status
    savedAt.value = new Date()
    emit('updated', updated)
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('lesson.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function setStatus(next) {
  await save()
  if (errorMessage.value) return
  try {
    const updated = await lessonsApi.update(props.lessonId, { status: next })
    status.value = updated.status
    emit('updated', updated)
  } catch (error) {
    toast.error(apiErrorText(error, t('lesson.statusFailed')))
  }
}

async function remove() {
  if (!(await confirm.ask({ message: t('lesson.confirmDelete', { title: form.title }) }))) return
  removing.value = true
  try {
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = null
    hydrating = true
    await lessonsApi.remove(props.lessonId)
    emit('removed', props.lessonId)
  } catch (error) {
    hydrating = false
    toast.error(apiErrorText(error, t('content.deleteFailed')))
  } finally {
    removing.value = false
  }
}

async function load() {
  loading.value = true
  hydrating = true
  errorMessage.value = ''
  try {
    const [lesson, content] = await Promise.all([
      lessonsApi.getById(props.lessonId),
      topicsApi.listContent(props.topicId).catch(() => []),
    ])
    form.title = lesson.title
    form.description = lesson.description ?? ''
    form.estimatedMinutes = lesson.estimatedMinutes ?? 0
    form.required = lesson.required !== false
    status.value = lesson.status
    courseId.value = lesson.courseId
    blocks.value = (lesson.blocks ?? []).map((block) => ({ ...block, _key: nextKey() }))
    topicVideos.value = content.filter((item) => item.contentType === 'VIDEO')
    topicMaterials.value = content.filter((item) =>
      ['FILE', 'PRESENTATION', 'MULTIMEDIA'].includes(item.contentType)
    )
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('lesson.loadFailed'))
  } finally {
    loading.value = false
    // One tick, so the watchers do not see the fields being filled as edits.
    window.setTimeout(() => {
      hydrating = false
    }, 0)
  }
}

onMounted(load)
watch([form, blocks], scheduleSave, { deep: true })

onBeforeUnmount(() => {
  // Closing the panel one keystroke after typing is exactly when an autosave
  // would be lost.
  if (saveTimer) {
    window.clearTimeout(saveTimer)
    saveTimer = null
    save()
  }
})

const savedLabel = computed(() => {
  if (saving.value) return t('lesson.saving')
  if (errorMessage.value) return ''
  if (!savedAt.value) return ''
  return t('lesson.savedAt', { time: savedAt.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
})
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface-2 p-4">
    <div v-if="loading" class="text-small text-ink-faint">{{ t('common.loading') }}</div>

    <template v-else>
      <!-- Header: what this lesson is, and what the last save did -->
      <div class="flex flex-wrap items-center gap-2">
        <AppInput v-model="form.title" class="min-w-0 flex-1" :placeholder="t('lesson.titlePlaceholder')" />
        <Badge :variant="status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
          {{ status === 'PUBLISHED' ? t('courses.status.published') : t('courses.status.draft') }}
        </Badge>
        <AppButton variant="ghost" size="sm" :icon="previewing ? 'pencil' : 'eye'" @click="previewing = !previewing">
          {{ previewing ? t('lesson.edit') : t('lesson.preview') }}
        </AppButton>
        <AppButton variant="ghost" size="sm" @click="setStatus(status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')">
          {{ status === 'PUBLISHED' ? t('materials.unpublish') : t('materials.publish') }}
        </AppButton>
        <AppButton variant="ghost" size="sm" icon="trash" :loading="removing" @click="remove" />
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-3 text-caption">
        <span v-if="savedLabel" class="flex items-center gap-1 text-ink-faint">
          <Icon :name="saving ? 'loader' : 'check'" size="12" :class="saving ? 'animate-spin' : ''" />
          {{ savedLabel }}
        </span>
        <span v-if="errorMessage" class="text-danger">{{ errorMessage }}</span>
        <span v-if="pendingBlocks" class="text-ink-faint">{{ t('lesson.pendingBlocks', { count: pendingBlocks }) }}</span>
      </div>

      <!-- Preview: the reader's own component, so this cannot drift -->
      <div v-if="previewing" class="mt-4 space-y-5 rounded-lg border border-border bg-surface p-4">
        <LessonBlock
          v-for="block in blocks.filter(isComplete)"
          :key="block._key"
          :block="block"
          :course-id="courseId"
        />
        <p v-if="!blocks.filter(isComplete).length" class="text-small text-ink-faint">{{ t('lesson.emptyPreview') }}</p>
      </div>

      <template v-else>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <AppInput v-model="form.description" :placeholder="t('lesson.descriptionPlaceholder')" class="sm:col-span-2" />
          <AppInput
            v-model="form.estimatedMinutes"
            type="number"
            min="0"
            :placeholder="t('lesson.minutesPlaceholder')"
          />
        </div>
        <label class="mt-2 flex items-center gap-1.5 text-caption text-ink-muted">
          <input v-model="form.required" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong text-primary" />
          {{ t('lesson.required') }}
        </label>

        <!-- The blocks themselves -->
        <SortableList v-model="blocks" item-key="_key" name="lesson-blocks" list-class="mt-4 space-y-2">
          <template #item="{ item, index, moveUp, moveDown, isFirst, isLast, dragging }">
            <div
              class="rounded-lg border border-border bg-surface p-3"
              :class="dragging ? 'opacity-50' : ''"
            >
              <div class="flex items-center gap-1.5">
                <Icon name="more-horizontal" size="14" class="cursor-grab text-ink-faint" />
                <span class="text-caption font-medium text-ink-muted">{{ t(`lesson.block.${item.type.toLowerCase()}`) }}</span>
                <span v-if="!isComplete(item)" class="text-caption text-warning">{{ t('lesson.blockIncomplete') }}</span>
                <div class="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                    :disabled="isFirst"
                    :aria-label="t('common.moveUp')"
                    @click="moveUp"
                  >
                    <Icon name="chevron-up" size="13" />
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                    :disabled="isLast"
                    :aria-label="t('common.moveDown')"
                    @click="moveDown"
                  >
                    <Icon name="chevron-down" size="13" />
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
                    :aria-label="t('lesson.duplicateBlock')"
                    @click="duplicateBlock(index)"
                  >
                    <Icon name="copy" size="13" />
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-danger"
                    :aria-label="t('common.delete')"
                    @click="removeBlock(index)"
                  >
                    <Icon name="trash" size="13" />
                  </button>
                </div>
              </div>

              <div class="mt-2 space-y-2">
                <template v-if="item.type === 'HEADING'">
                  <div class="flex gap-2">
                    <AppInput v-model="item.text" class="flex-1" :placeholder="t('lesson.block.heading')" />
                    <AppSelect
                      v-model="item.level"
                      class="w-28"
                      :options="[
                        { value: 2, label: t('lesson.headingLevel', { level: 2 }) },
                        { value: 3, label: t('lesson.headingLevel', { level: 3 }) },
                        { value: 4, label: t('lesson.headingLevel', { level: 4 }) },
                      ]"
                    />
                  </div>
                </template>

                <RichText
                  v-else-if="item.type === 'TEXT'"
                  v-model="item.text"
                  :placeholder="t('lesson.textPlaceholder')"
                />

                <template v-else-if="item.type === 'QUOTE'">
                  <RichText v-model="item.text" :placeholder="t('lesson.quotePlaceholder')" min-height="3.5rem" />
                  <AppInput v-model="item.author" :placeholder="t('lesson.authorPlaceholder')" />
                </template>

                <template v-else-if="item.type === 'CALLOUT'">
                  <AppSelect
                    v-model="item.variant"
                    class="w-44"
                    :options="CALLOUT_VARIANTS.map((variant) => ({ value: variant, label: t(`lesson.callout.${variant.toLowerCase()}`) }))"
                  />
                  <RichText v-model="item.text" :placeholder="t('lesson.calloutPlaceholder')" min-height="3.5rem" />
                </template>

                <template v-else-if="item.type === 'CODE'">
                  <AppInput v-model="item.language" class="w-40" :placeholder="t('lesson.languagePlaceholder')" />
                  <textarea
                    v-model="item.text"
                    rows="5"
                    spellcheck="false"
                    class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-caption text-ink outline-none focus:border-primary"
                    :placeholder="t('lesson.codePlaceholder')"
                  />
                </template>

                <template v-else-if="item.type === 'IMAGE'">
                  <ImageUploadField v-model="item.url" aspect="aspect-video" />
                  <AppInput v-model="item.alt" :placeholder="t('lesson.altPlaceholder')" />
                  <AppInput v-model="item.caption" :placeholder="t('lesson.captionPlaceholder')" />
                </template>

                <template v-else-if="item.type === 'GALLERY'">
                  <div v-for="(galleryItem, galleryIndex) in item.items" :key="galleryIndex" class="rounded-lg border border-border p-2">
                    <ImageUploadField v-model="galleryItem.url" aspect="aspect-video" />
                    <div class="mt-1.5 flex gap-2">
                      <AppInput v-model="galleryItem.alt" class="flex-1" :placeholder="t('lesson.altPlaceholder')" />
                      <AppButton
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        :disabled="item.items.length <= 1"
                        @click="removeGalleryItem(item, galleryIndex)"
                      />
                    </div>
                  </div>
                  <AppButton variant="ghost" size="sm" icon="plus" @click="addGalleryItem(item)">
                    {{ t('lesson.addImage') }}
                  </AppButton>
                </template>

                <template v-else-if="item.type === 'EMBED'">
                  <AppInput v-model="item.url" :placeholder="t('lesson.embedPlaceholder')" />
                  <p class="text-caption text-ink-faint">{{ t('lesson.embedHint') }}</p>
                  <AppInput v-model="item.caption" :placeholder="t('lesson.captionPlaceholder')" />
                </template>

                <template v-else-if="item.type === 'VIDEO'">
                  <AppSelect
                    v-if="topicVideos.length"
                    v-model="item.videoId"
                    :options="topicVideos.map((video) => ({ value: video.id, label: video.title }))"
                  />
                  <p v-else class="text-caption text-ink-faint">{{ t('lesson.noVideos') }}</p>
                  <AppInput v-model="item.caption" :placeholder="t('lesson.captionPlaceholder')" />
                </template>

                <template v-else-if="item.type === 'FILE'">
                  <AppSelect
                    v-if="topicMaterials.length"
                    v-model="item.materialId"
                    :options="topicMaterials.map((material) => ({ value: material.id, label: material.title }))"
                  />
                  <p v-else class="text-caption text-ink-faint">{{ t('lesson.noMaterials') }}</p>
                  <AppInput v-model="item.caption" :placeholder="t('lesson.captionPlaceholder')" />
                </template>

                <template v-else-if="item.type === 'TABLE'">
                  <label class="flex items-center gap-1.5 text-caption text-ink-muted">
                    <input
                      v-model="item.hasHeader"
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border-border-strong text-primary"
                    />
                    {{ t('lesson.tableHeader') }}
                  </label>
                  <div class="overflow-x-auto">
                    <table class="border-collapse">
                      <tr v-for="(row, rowIndex) in item.rows" :key="rowIndex">
                        <td v-for="(cell, cellIndex) in row" :key="cellIndex" class="p-0.5">
                          <input
                            v-model="item.rows[rowIndex][cellIndex]"
                            class="w-32 rounded border border-border bg-surface px-1.5 py-1 text-caption text-ink outline-none focus:border-primary"
                          />
                        </td>
                        <td class="p-0.5">
                          <button
                            type="button"
                            class="rounded p-1 text-ink-faint hover:text-danger disabled:opacity-30"
                            :disabled="item.rows.length <= 1"
                            :aria-label="t('lesson.removeRow')"
                            @click="removeRow(item, rowIndex)"
                          >
                            <Icon name="trash" size="12" />
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td v-for="(cell, cellIndex) in item.rows[0] ?? []" :key="cellIndex" class="p-0.5 text-center">
                          <button
                            type="button"
                            class="rounded p-1 text-ink-faint hover:text-danger disabled:opacity-30"
                            :disabled="(item.rows[0]?.length ?? 0) <= 1"
                            :aria-label="t('lesson.removeColumn')"
                            @click="removeColumn(item, cellIndex)"
                          >
                            <Icon name="close" size="12" />
                          </button>
                        </td>
                      </tr>
                    </table>
                  </div>
                  <div class="flex gap-2">
                    <AppButton variant="ghost" size="sm" icon="plus" @click="addRow(item)">{{ t('lesson.addRow') }}</AppButton>
                    <AppButton variant="ghost" size="sm" icon="plus" @click="addColumn(item)">{{ t('lesson.addColumn') }}</AppButton>
                  </div>
                  <AppInput v-model="item.caption" :placeholder="t('lesson.captionPlaceholder')" />
                </template>

                <p v-else class="text-caption text-ink-faint">{{ t('lesson.block.divider') }}</p>
              </div>
            </div>
          </template>

          <template #empty>
            <p class="mt-4 text-small text-ink-faint">{{ t('lesson.noBlocks') }}</p>
          </template>
        </SortableList>

        <!-- Add a block -->
        <div class="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
          <AppButton
            v-for="blockType in BLOCK_TYPES"
            :key="blockType.type"
            variant="ghost"
            size="sm"
            :icon="blockType.icon"
            @click="addBlock(blockType.type)"
          >
            {{ t(`lesson.block.${blockType.type.toLowerCase()}`) }}
          </AppButton>
        </div>
      </template>
    </template>
  </div>
</template>

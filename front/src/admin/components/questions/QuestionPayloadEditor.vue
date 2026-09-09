<script setup>
/**
 * The type-specific half of the question editor.
 *
 * Fourteen types, one component, switching on `type`. The alternative —
 * fourteen components — was tempting until the third one, because they all
 * do the same two things: edit a small list, and mark part of it correct.
 * What genuinely differs is which part, and that fits in a branch.
 *
 * The parent owns `modelValue` (the payload) and the type; this only ever
 * mutates the payload in place, so switching type is the parent's problem
 * to reset.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
  type: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const payload = computed(() => props.modelValue)

function patch(fields) {
  emit('update:modelValue', { ...props.modelValue, ...fields })
}

// Option ids are generated here and never renumbered, because an answer
// stored on an attempt refers to one. Reordering or deleting an option must
// not silently re-point somebody's past answer at a different one.
function nextOptionId(options) {
  const used = new Set(options.map((option) => option.id))
  let index = options.length + 1
  while (used.has(`o${index}`)) index += 1
  return `o${index}`
}

function addOption() {
  const options = [...(payload.value.options ?? [])]
  options.push({ id: nextOptionId(options), text: '', isCorrect: false })
  patch({ options })
}

function removeOption(index) {
  const options = [...(payload.value.options ?? [])]
  options.splice(index, 1)
  patch({ options })
}

function toggleCorrect(index) {
  const options = (payload.value.options ?? []).map((option, i) => {
    if (props.type === 'SINGLE_CHOICE') {
      // Exactly one, enforced here as well as by the server: an editor that
      // lets you save two correct answers to a single-choice question is an
      // editor that produces a validation error you cannot see the cause of.
      return { ...option, isCorrect: i === index }
    }
    return i === index ? { ...option, isCorrect: !option.isCorrect } : option
  })
  patch({ options })
}

function addTo(key, value) {
  patch({ [key]: [...(payload.value[key] ?? []), value] })
}

function removeFrom(key, index) {
  const list = [...(payload.value[key] ?? [])]
  list.splice(index, 1)
  patch({ [key]: list })
}

function updateAt(key, index, value) {
  const list = [...(payload.value[key] ?? [])]
  list[index] = value
  patch({ [key]: list })
}

const isChoice = computed(() => ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(props.type))
const isDrag = computed(() => ['DRAG_DROP', 'DRAG_WORDS'].includes(props.type))
</script>

<template>
  <div class="space-y-3">
    <!-- Options: single and multiple choice -->
    <template v-if="isChoice">
      <p class="text-small font-medium text-ink">{{ t('questions.options') }}</p>
      <div v-for="(option, index) in payload.options ?? []" :key="option.id" class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-default"
          :class="option.isCorrect ? 'border-success bg-success-subtle text-success' : 'border-border text-ink-faint hover:bg-surface-hover'"
          :title="t('questions.markCorrect')"
          @click="toggleCorrect(index)"
        >
          <Icon name="check" size="14" />
        </button>
        <AppInput
          class="flex-1"
          :model-value="option.text"
          :placeholder="t('questions.optionPlaceholder')"
          @update:model-value="(value) => updateAt('options', index, { ...option, text: value })"
        />
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeOption(index)" />
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addOption">{{ t('questions.addOption') }}</AppButton>
      <p class="text-caption text-ink-faint">
        {{ type === 'SINGLE_CHOICE' ? t('questions.singleHint') : t('questions.multiHint') }}
      </p>
    </template>

    <!-- True / false -->
    <template v-else-if="type === 'TRUE_FALSE'">
      <p class="text-small font-medium text-ink">{{ t('questions.correctAnswer') }}</p>
      <div class="flex gap-2">
        <AppButton
          v-for="value in [true, false]"
          :key="String(value)"
          :variant="payload.correct === value ? 'primary' : 'secondary'"
          size="sm"
          @click="patch({ correct: value })"
        >
          {{ value ? t('common.yes') : t('common.no') }}
        </AppButton>
      </div>
    </template>

    <!-- Short answer -->
    <template v-else-if="type === 'SHORT_ANSWER'">
      <p class="text-small font-medium text-ink">{{ t('questions.acceptedAnswers') }}</p>
      <div v-for="(accepted, index) in payload.accepted ?? []" :key="index" class="flex gap-2">
        <AppInput
          class="flex-1"
          :model-value="accepted"
          @update:model-value="(value) => updateAt('accepted', index, value)"
        />
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('accepted', index)" />
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addTo('accepted', '')">
        {{ t('questions.addAccepted') }}
      </AppButton>
      <label class="flex items-center gap-2 text-small text-ink">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-border-strong"
          :checked="payload.caseSensitive"
          @change="patch({ caseSensitive: $event.target.checked })"
        />
        {{ t('questions.caseSensitive') }}
      </label>
      <p class="text-caption text-ink-faint">{{ t('questions.acceptedHint') }}</p>
    </template>

    <!-- Numeric -->
    <template v-else-if="type === 'NUMERIC'">
      <div class="grid grid-cols-2 gap-3">
        <AppInput
          type="number"
          :label="t('questions.value')"
          :model-value="payload.value ?? 0"
          @update:model-value="(value) => patch({ value: Number(value) })"
        />
        <AppInput
          type="number"
          :label="t('questions.tolerance')"
          :hint="t('questions.toleranceHint')"
          :model-value="payload.tolerance ?? 0"
          @update:model-value="(value) => patch({ tolerance: Number(value) })"
        />
      </div>
    </template>

    <!-- Matching -->
    <template v-else-if="type === 'MATCHING'">
      <p class="text-small font-medium text-ink">{{ t('questions.pairs') }}</p>
      <div v-for="(pair, index) in payload.pairs ?? []" :key="index" class="flex items-center gap-2">
        <AppInput
          class="flex-1"
          :model-value="pair.left"
          :placeholder="t('questions.left')"
          @update:model-value="(value) => updateAt('pairs', index, { ...pair, left: value })"
        />
        <Icon name="arrow-right" size="14" class="shrink-0 text-ink-faint" />
        <AppInput
          class="flex-1"
          :model-value="pair.right"
          :placeholder="t('questions.right')"
          @update:model-value="(value) => updateAt('pairs', index, { ...pair, right: value })"
        />
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('pairs', index)" />
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addTo('pairs', { left: '', right: '' })">
        {{ t('questions.addPair') }}
      </AppButton>
      <p class="text-caption text-ink-faint">{{ t('questions.matchingHint') }}</p>
    </template>

    <!-- Sequence -->
    <template v-else-if="type === 'SEQUENCE'">
      <p class="text-small font-medium text-ink">{{ t('questions.sequenceItems') }}</p>
      <div v-for="(item, index) in payload.items ?? []" :key="index" class="flex items-center gap-2">
        <span class="w-5 shrink-0 text-caption text-ink-faint">{{ index + 1 }}.</span>
        <AppInput class="flex-1" :model-value="item" @update:model-value="(value) => updateAt('items', index, value)" />
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('items', index)" />
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addTo('items', '')">
        {{ t('questions.addItem') }}
      </AppButton>
      <p class="text-caption text-ink-faint">{{ t('questions.sequenceHint') }}</p>
    </template>

    <!-- Fill in the blanks -->
    <template v-else-if="type === 'FILL_BLANK'">
      <div>
        <label class="mb-1.5 block text-small font-medium text-ink">{{ t('questions.template') }}</label>
        <textarea
          rows="3"
          class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          :value="payload.template ?? ''"
          @input="patch({ template: $event.target.value })"
        />
        <p class="mt-1 text-caption text-ink-faint">{{ t('questions.templateHint') }}</p>
      </div>
      <div v-for="(blank, index) in payload.blanks ?? []" :key="index" class="rounded-lg border border-border p-3">
        <p class="mb-2 text-caption text-ink-muted">{{ t('questions.blankNumber', { number: index + 1 }) }}</p>
        <AppInput
          :model-value="(blank.accepted ?? []).join(' | ')"
          :placeholder="t('questions.blankPlaceholder')"
          @update:model-value="
            (value) =>
              updateAt('blanks', index, {
                ...blank,
                accepted: value.split('|').map((entry) => entry.trim()).filter(Boolean),
              })
          "
        />
        <AppButton class="mt-2" variant="ghost" size="sm" icon="trash" @click="removeFrom('blanks', index)">
          {{ t('common.delete') }}
        </AppButton>
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addTo('blanks', { accepted: [] })">
        {{ t('questions.addBlank') }}
      </AppButton>
    </template>

    <!-- Select from a list -->
    <template v-else-if="type === 'SELECT_LIST'">
      <div v-for="(blank, index) in payload.blanks ?? []" :key="index" class="rounded-lg border border-border p-3">
        <p class="mb-2 text-caption text-ink-muted">{{ t('questions.blankNumber', { number: index + 1 }) }}</p>
        <AppInput
          :model-value="(blank.options ?? []).join(' | ')"
          :placeholder="t('questions.selectListPlaceholder')"
          @update:model-value="
            (value) =>
              updateAt('blanks', index, {
                ...blank,
                options: value.split('|').map((entry) => entry.trim()).filter(Boolean),
              })
          "
        />
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="(option, optionIndex) in blank.options ?? []"
            :key="optionIndex"
            type="button"
            class="rounded-full border px-2.5 py-1 text-caption transition-default"
            :class="blank.correctIndex === optionIndex ? 'border-success bg-success-subtle text-success' : 'border-border text-ink-muted hover:bg-surface-hover'"
            @click="updateAt('blanks', index, { ...blank, correctIndex: optionIndex })"
          >
            {{ option }}
          </button>
        </div>
        <AppButton class="mt-2" variant="ghost" size="sm" icon="trash" @click="removeFrom('blanks', index)">
          {{ t('common.delete') }}
        </AppButton>
      </div>
      <AppButton
        variant="secondary"
        size="sm"
        icon="plus"
        @click="addTo('blanks', { options: [], correctIndex: 0 })"
      >
        {{ t('questions.addBlank') }}
      </AppButton>
    </template>

    <!-- Hotspot -->
    <template v-else-if="type === 'HOTSPOT'">
      <AppInput
        :label="t('questions.imageKey')"
        :hint="t('questions.imageKeyHint')"
        :model-value="payload.imageKey ?? ''"
        @update:model-value="(value) => patch({ imageKey: value })"
      />
      <p class="text-small font-medium text-ink">{{ t('questions.areas') }}</p>
      <div v-for="(area, index) in payload.areas ?? []" :key="index" class="flex items-center gap-2">
        <AppInput
          v-for="field in ['x', 'y', 'w', 'h']"
          :key="field"
          class="w-20"
          type="number"
          :placeholder="field"
          :model-value="area[field] ?? 0"
          @update:model-value="(value) => updateAt('areas', index, { ...area, [field]: Number(value) })"
        />
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-default"
          :class="area.isCorrect ? 'border-success bg-success-subtle text-success' : 'border-border text-ink-faint'"
          @click="updateAt('areas', index, { ...area, isCorrect: !area.isCorrect })"
        >
          <Icon name="check" size="14" />
        </button>
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('areas', index)" />
      </div>
      <AppButton
        variant="secondary"
        size="sm"
        icon="plus"
        @click="addTo('areas', { x: 10, y: 10, w: 20, h: 20, isCorrect: true })"
      >
        {{ t('questions.addArea') }}
      </AppButton>
      <p class="text-caption text-ink-faint">{{ t('questions.areasHint') }}</p>
    </template>

    <!-- Likert -->
    <template v-else-if="type === 'LIKERT'">
      <AppInput
        type="number"
        :label="t('questions.scale')"
        :model-value="payload.scale ?? 5"
        @update:model-value="(value) => patch({ scale: Number(value) })"
      />
      <AppInput
        :label="t('questions.scaleLabels')"
        :hint="t('questions.scaleLabelsHint')"
        :model-value="(payload.labels ?? []).join(' | ')"
        @update:model-value="
          (value) => patch({ labels: value.split('|').map((entry) => entry.trim()).filter(Boolean) })
        "
      />
      <p class="text-caption text-ink-faint">{{ t('questions.likertHint') }}</p>
    </template>

    <!-- Drag and drop / drag the words -->
    <template v-else-if="isDrag">
      <p class="text-small font-medium text-ink">{{ t('questions.zones') }}</p>
      <div v-for="(zone, index) in payload.zones ?? []" :key="index" class="flex items-center gap-2">
        <AppInput
          class="w-28"
          :model-value="zone.id"
          placeholder="id"
          @update:model-value="(value) => updateAt('zones', index, { ...zone, id: value })"
        />
        <AppInput
          class="flex-1"
          :model-value="zone.label"
          :placeholder="t('questions.zoneLabel')"
          @update:model-value="(value) => updateAt('zones', index, { ...zone, label: value })"
        />
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('zones', index)" />
      </div>
      <AppButton variant="secondary" size="sm" icon="plus" @click="addTo('zones', { id: '', label: '' })">
        {{ t('questions.addZone') }}
      </AppButton>

      <p class="mt-3 text-small font-medium text-ink">{{ t('questions.items') }}</p>
      <div v-for="(item, index) in payload.items ?? []" :key="index" class="flex items-center gap-2">
        <AppInput
          class="flex-1"
          :model-value="item.text"
          :placeholder="t('questions.itemText')"
          @update:model-value="(value) => updateAt('items', index, { ...item, text: value, id: item.id || `i${index + 1}` })"
        />
        <select
          class="h-10 rounded-md border border-border-strong bg-surface px-2 text-small text-ink"
          :value="item.zoneId"
          @change="updateAt('items', index, { ...item, zoneId: $event.target.value })"
        >
          <option value="">—</option>
          <option v-for="zone in payload.zones ?? []" :key="zone.id" :value="zone.id">{{ zone.label || zone.id }}</option>
        </select>
        <AppButton variant="ghost" size="sm" icon="trash" @click="removeFrom('items', index)" />
      </div>
      <AppButton
        variant="secondary"
        size="sm"
        icon="plus"
        @click="addTo('items', { id: `i${(payload.items ?? []).length + 1}`, text: '', zoneId: '' })"
      >
        {{ t('questions.addItem') }}
      </AppButton>
    </template>

    <!-- Essay -->
    <template v-else-if="type === 'ESSAY'">
      <div class="grid grid-cols-2 gap-3">
        <AppInput
          type="number"
          :label="t('questions.minWords')"
          :model-value="payload.minWords ?? 0"
          @update:model-value="(value) => patch({ minWords: Number(value) })"
        />
        <AppInput
          type="number"
          :label="t('questions.maxWords')"
          :model-value="payload.maxWords ?? 0"
          @update:model-value="(value) => patch({ maxWords: Number(value) })"
        />
      </div>
      <p class="text-caption text-ink-faint">{{ t('questions.essayHint') }}</p>
    </template>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import Modal from './Modal.vue'
import AppButton from './AppButton.vue'

const { t } = useI18n()
const { state, settle } = useConfirm()
</script>

<template>
  <!-- Closing the modal any other way (backdrop, the X, Escape) is a "no",
       which is the safe answer for every question this dialog asks. -->
  <Modal
    :model-value="state.open"
    size="sm"
    :title="state.title || t('confirm.title')"
    @update:model-value="!$event && settle(false)"
  >
    <p class="text-small text-ink-muted">{{ state.message }}</p>

    <template #footer>
      <AppButton variant="ghost" @click="settle(false)">
        {{ state.cancelLabel || t('common.cancel') }}
      </AppButton>
      <AppButton :variant="state.danger ? 'danger' : 'primary'" @click="settle(true)">
        {{ state.confirmLabel || t('confirm.confirm') }}
      </AppButton>
    </template>
  </Modal>
</template>

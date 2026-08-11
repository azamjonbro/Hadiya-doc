<script setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ErrorState from '@/components/ui/ErrorState.vue'
import AppButton from '@/components/ui/AppButton.vue'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="flex min-h-screen bg-bg">
    <ErrorState code="404" icon="search" :title="t('notFound.title')" :description="t('notFound.message')">
      <template #actions>
        <AppButton icon="home" @click="router.push('/')">{{ t('common.goToDashboard') }}</AppButton>
      </template>
    </ErrorState>
  </div>
</template>

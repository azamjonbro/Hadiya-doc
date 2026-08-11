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
    <ErrorState code="401" icon="lock" :title="t('unauthorized.title')" :description="t('unauthorized.message')">
      <template #actions>
        <AppButton icon="arrow-right" icon-position="right" @click="router.push('/login')">{{ t('auth.login.title') }}</AppButton>
      </template>
    </ErrorState>
  </div>
</template>

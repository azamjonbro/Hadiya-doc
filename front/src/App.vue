<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const theme = useThemeStore()
onMounted(() => theme.apply())
</script>

<template>
  <router-view />
  <ToastHost />
  <ConfirmDialog />
</template>

<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import ToastHost from '@/components/ui/ToastHost.vue'

const theme = useThemeStore()
onMounted(() => theme.apply())
</script>

<template>
  <router-view />
  <ToastHost />
</template>

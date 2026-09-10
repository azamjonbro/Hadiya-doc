<script setup>
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg">
    <Topbar class="sticky top-0 z-30 w-full" />
    <div class="flex flex-1 min-h-0">
      <Sidebar class="sticky top-16 hidden h-[calc(100vh-4rem)] lg:flex z-20" />
      <main class="flex-1 min-w-0 overflow-y-auto pb-20 lg:pb-0 relative">
        <router-view />
      </main>
    </div>
  </div>
</template>

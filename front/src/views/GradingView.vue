<script setup>
// Portal §7: the same review queue the admin panel has, reached from the
// "···" menu by whoever holds quiz:grade. The queue component owns its
// data and modal; this page only gives it the portal's 840px column.
import GradingQueueView from '@/admin/views/GradingQueueView.vue'
</script>

<template>
  <div class="min-h-screen bg-surface pb-12">
    <div class="mx-auto w-full max-w-[900px]">
      <GradingQueueView />
    </div>
  </div>
</template>

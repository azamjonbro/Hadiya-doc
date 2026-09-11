<script setup>
/**
 * The 160px banner over a portal page (reference §1–2): a photo under a
 * dark wash, the page title in white at the content's left edge.
 *
 * The photo is `/hero/<image>.jpg` if the deployment ships one and a
 * gradient otherwise — CSS stacks both, and a missing file simply leaves
 * the gradient. No hotlinked stock photo: the app must open with no
 * internet (12.2) and the previous hero pulled from Unsplash.
 */
const props = defineProps({
  title: { type: String, required: true },
  image: { type: String, default: '' },
  height: { type: String, default: 'h-[160px]' },
})
const backgroundImage = props.image ? `url('/hero/${props.image}.jpg')` : 'none'
</script>

<template>
  <div class="relative w-full overflow-hidden bg-slate-800" :class="height">
    <div
      class="absolute inset-0 bg-cover bg-center"
      :style="{ backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.72), rgba(15,23,42,.45)), ${backgroundImage}` }"
      aria-hidden="true"
    />
    <div
      class="absolute inset-0 opacity-30"
      style="background-image: radial-gradient(circle at 20% 80%, rgba(52,124,26,.55), transparent 45%), radial-gradient(circle at 80% 20%, rgba(14,116,144,.5), transparent 40%)"
      aria-hidden="true"
    />
    <div class="relative mx-auto flex h-full w-full max-w-[1140px] items-center px-4">
      <h1 class="text-[32px] font-semibold text-white">{{ title }}</h1>
      <slot />
    </div>
  </div>
</template>

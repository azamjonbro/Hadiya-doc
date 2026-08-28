<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { courseReviewsApi } from '@/services/courseReviews'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ courseId: { type: String, required: true } })

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const loading = ref(true)
const items = ref([])
const avgRating = ref(0)
const count = ref(0)

const myRating = ref(0)
const hoverRating = ref(0)
const myComment = ref('')
const submitting = ref(false)

const myReview = computed(() => items.value.find((r) => r.userId === auth.user?.id))

async function load() {
  loading.value = true
  try {
    const result = await courseReviewsApi.list(props.courseId, { limit: 50 })
    items.value = result.items
    avgRating.value = result.avgRating
    count.value = result.count
    if (myReview.value) {
      myRating.value = myReview.value.rating
      myComment.value = myReview.value.comment
    }
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!myRating.value) return
  submitting.value = true
  try {
    await courseReviewsApi.upsert(props.courseId, { rating: myRating.value, comment: myComment.value })
    toast.success(t('reviews.submitted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('reviews.error')))
  } finally {
    submitting.value = false
  }
}

async function remove(reviewId) {
  try {
    await courseReviewsApi.remove(props.courseId, reviewId)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('reviews.error')))
  }
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(locale.value)
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center gap-3">
      <span class="text-h2 text-ink">{{ avgRating || '—' }}</span>
      <div>
        <div class="flex items-center gap-0.5">
          <Icon v-for="i in 5" :key="i" name="star" size="15" :class="i <= Math.round(avgRating) ? 'text-warning' : 'text-border-strong'" />
        </div>
        <p class="mt-0.5 text-caption text-ink-faint">{{ t('reviews.count', { count }) }}</p>
      </div>
    </div>

    <div class="mt-5 rounded-lg border border-border bg-surface p-4">
      <p class="text-small font-semibold text-ink">{{ myReview ? t('reviews.editYours') : t('reviews.leaveOne') }}</p>
      <div class="mt-2 flex items-center gap-1">
        <button
          v-for="i in 5"
          :key="i"
          type="button"
          class="p-0.5"
          @mouseenter="hoverRating = i"
          @mouseleave="hoverRating = 0"
          @click="myRating = i"
        >
          <Icon name="star" size="22" :class="i <= (hoverRating || myRating) ? 'text-warning' : 'text-border-strong'" />
        </button>
      </div>
      <textarea
        v-model="myComment"
        rows="2"
        :placeholder="t('reviews.commentPlaceholder')"
        class="mt-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-small text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
      <AppButton class="mt-3" size="sm" :disabled="!myRating" :loading="submitting" @click="submit">
        {{ myReview ? t('reviews.update') : t('reviews.submit') }}
      </AppButton>
    </div>

    <div class="mt-5 space-y-3">
      <template v-if="loading">
        <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
      </template>
      <EmptyState v-else-if="items.length === 0" icon="star" :title="t('reviews.empty')" />
      <div v-else v-for="review in items" :key="review.id" class="rounded-lg border border-border bg-surface p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <Avatar :name="review.fullName" size="sm" />
            <div>
              <p class="text-small font-medium text-ink">{{ review.fullName }}</p>
              <div class="mt-0.5 flex items-center gap-1.5">
                <div class="flex items-center gap-0.5">
                  <Icon v-for="i in 5" :key="i" name="star" size="11" :class="i <= review.rating ? 'text-warning' : 'text-border-strong'" />
                </div>
                <span class="text-caption text-ink-faint">{{ formatDate(review.createdAt) }}</span>
              </div>
            </div>
          </div>
          <button
            v-if="review.userId === auth.user?.id || auth.hasPermission('course:update')"
            type="button"
            class="text-ink-faint hover:text-danger"
            @click="remove(review.id)"
          >
            <Icon name="trash" size="14" />
          </button>
        </div>
        <p v-if="review.comment" class="mt-2.5 text-small text-ink-muted">{{ review.comment }}</p>
      </div>
    </div>
  </div>
</template>

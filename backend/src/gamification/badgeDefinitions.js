// Badges are computed on read from ledger totals rather than stored — no
// admin CRUD UI or seed step needed for this MVP set. Titles/descriptions
// are resolved client-side by i18n key from `code`.
export const BADGE_DEFINITIONS = [
  { code: 'FIRST_STEP', check: (s) => s.videosCompleted >= 1 },
  { code: 'QUIZ_TAKER', check: (s) => s.quizzesPassed >= 1 },
  { code: 'QUIZ_MASTER', check: (s) => s.quizzesPassed >= 5 },
  { code: 'POINTS_100', check: (s) => s.totalPoints >= 100 },
  { code: 'POINTS_500', check: (s) => s.totalPoints >= 500 },
]

export function computeEarnedBadges(summary) {
  return BADGE_DEFINITIONS.filter((badge) => badge.check(summary)).map((badge) => badge.code)
}

import { AiGenerationJob } from '../../models/aiGenerationJob.model.js'
import { settingsService } from '../settings/settings.service.js'
import { ApiError } from '../../utils/ApiError.js'

/**
 * The monthly token ceiling (10.6).
 *
 * Every generation job records what it cost (aiGenerationJob.usage), which
 * is what makes a budget possible: the ceiling is enforced against real
 * usage figures from the API rather than an estimate of what a prompt
 * "should" cost.
 *
 * Checked *before* a job runs and recorded *after*, which means a single
 * job can cross the line — the check cannot know what the answer will cost
 * until it exists. That is the honest behaviour: the alternative is
 * refusing anything that *might* exceed the budget, which would block the
 * last third of every month.
 */

/** The first instant of the current month, in the server's timezone. */
function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export const aiBudgetService = {
  async usageThisMonth({ now = new Date() } = {}) {
    const [totals] = await AiGenerationJob.aggregate([
      { $match: { createdAt: { $gte: monthStart(now) } } },
      {
        $group: {
          _id: null,
          inputTokens: { $sum: '$usage.inputTokens' },
          outputTokens: { $sum: '$usage.outputTokens' },
          jobs: { $sum: 1 },
        },
      },
    ])

    const settings = await settingsService.get()
    const budget = settings?.ai?.monthlyTokenBudget ?? 0
    const used = (totals?.inputTokens ?? 0) + (totals?.outputTokens ?? 0)

    return {
      month: monthStart(now).toISOString().slice(0, 7),
      inputTokens: totals?.inputTokens ?? 0,
      outputTokens: totals?.outputTokens ?? 0,
      used,
      jobs: totals?.jobs ?? 0,
      budget,
      // Null rather than Infinity when there is no budget: "no limit" and
      // "a very large limit" read differently on a settings page.
      remaining: budget ? Math.max(0, budget - used) : null,
      exceeded: Boolean(budget) && used >= budget,
    }
  },

  /**
   * @throws 400 AI_DISABLED when generation is switched off
   * @throws 400 AI_BUDGET_EXCEEDED when this month is spent
   */
  async assertCanGenerate() {
    const settings = await settingsService.get()
    if (settings?.ai?.generationEnabled === false) {
      throw ApiError.badRequest('AI generation is switched off for this company', 'AI_DISABLED')
    }

    const usage = await this.usageThisMonth()
    if (usage.exceeded) {
      throw ApiError.badRequest("This month's AI budget is used up", 'AI_BUDGET_EXCEEDED', {
        used: usage.used,
        budget: usage.budget,
      })
    }
    return usage
  },
}

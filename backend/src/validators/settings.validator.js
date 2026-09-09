import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colour must be #rrggbb')

/**
 * Every section is optional and every field within it is optional: the
 * screen sends only what changed, and an omitted field means "leave it"
 * rather than "clear it".
 *
 * Nothing here accepts a credential. SMTP passwords, storage keys and
 * tokens stay in the environment — see settings.model.js.
 */
export const updateSettingsSchema = z
  .object({
    branding: z
      .object({
        appName: z.string().trim().max(120).optional(),
        logoUrl: z.string().trim().max(1000).optional(),
        faviconUrl: z.string().trim().max(1000).optional(),
        primaryColor: hexColor.optional(),
        loginBackgroundUrl: z.string().trim().max(1000).optional(),
        supportEmail: z.string().trim().email().max(200).or(z.literal('')).optional(),
      })
      .optional(),
    mail: z
      .object({
        enabled: z.boolean().optional(),
        fromName: z.string().trim().max(120).optional(),
        fromEmail: z.string().trim().email().max(200).or(z.literal('')).optional(),
        replyTo: z.string().trim().email().max(200).or(z.literal('')).optional(),
        footerText: z.string().trim().max(1000).optional(),
      })
      .optional(),
    notifications: z
      .object({
        emailEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        digestHour: z.coerce.number().int().min(0).max(23).optional(),
      })
      .optional(),
    gamification: z
      .object({
        enabled: z.boolean().optional(),
        pointsPerVideo: z.coerce.number().int().min(0).max(10000).optional(),
        pointsPerQuiz: z.coerce.number().int().min(0).max(10000).optional(),
        leaderboardVisible: z.boolean().optional(),
      })
      .optional(),
    grading: z
      .object({
        defaultPassScore: z.coerce.number().int().min(0).max(100).optional(),
        defaultMaxAttempts: z.coerce.number().int().min(0).max(100).optional(),
        defaultRevealMode: z.enum(['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_LAST_ATTEMPT']).optional(),
        defaultScorePolicy: z.enum(['LAST', 'BEST', 'FIRST', 'AVERAGE']).optional(),
      })
      .optional(),
    locale: z
      .object({
        defaultLang: z.enum(['uz', 'ru', 'en']).optional(),
        timezone: z.string().trim().max(60).optional(),
        weekStartsOn: z.coerce.number().int().min(0).max(6).optional(),
      })
      .optional(),
    security: z
      .object({
        sessionHours: z.coerce.number().int().min(1).max(720).optional(),
        passwordMinLength: z.coerce.number().int().min(8).max(64).optional(),
        requireTwoFactor: z.boolean().optional(),
        maxLoginAttempts: z.coerce.number().int().min(0).max(50).optional(),
        lockoutMinutes: z.coerce.number().int().min(1).max(1440).optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No settings to update' })

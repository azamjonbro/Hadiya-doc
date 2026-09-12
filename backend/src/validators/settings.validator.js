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
        coursesCoverUrl: z.string().trim().max(1000).optional(),
        catalogCoverUrl: z.string().trim().max(1000).optional(),
        profileCoverUrl: z.string().trim().max(1000).optional(),
        portalNav: z.array(z.object({ name: z.string().trim().min(1).max(60), enabled: z.boolean().optional() })).max(40).optional(),
        startPage: z.string().trim().max(60).optional(),
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
    // AI generation (10.6). 0 is a real value — it means no ceiling — so
    // the minimum is 0 rather than 1.
    ai: z
      .object({
        monthlyTokenBudget: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
        generationEnabled: z.boolean().optional(),
      })
      .optional(),
    // Single sign-on (11.4). Only the mapping and the switch — the issuer
    // and the client secret are environment configuration, so there is
    // nothing secret in this section and nothing here to mask on the way
    // out.
    sso: z
      .object({
        enabled: z.boolean().optional(),
        buttonLabel: z.string().trim().max(60).optional(),
        scopes: z.array(z.string().trim().min(1).max(60)).min(1).max(12).optional(),
        autoProvision: z.boolean().optional(),
        defaultRoleName: z.string().trim().min(2).max(40).optional(),
        // Domains, not e-mail addresses: "@" is the usual mistake and it
        // would silently match nothing.
        allowedEmailDomains: z
          .array(
            z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'A bare domain, e.g. example.uz')
          )
          .max(20)
          .optional(),
        claims: z
          .object({
            jshshir: z.string().trim().max(60).optional(),
            email: z.string().trim().max(60).optional(),
            firstName: z.string().trim().max(60).optional(),
            lastName: z.string().trim().max(60).optional(),
            fullName: z.string().trim().max(60).optional(),
            department: z.string().trim().max(60).optional(),
            branch: z.string().trim().max(60).optional(),
            position: z.string().trim().max(60).optional(),
            employeeNumber: z.string().trim().max(60).optional(),
          })
          .optional(),
        roleRules: z
          .array(
            z.object({
              claim: z.string().trim().min(1).max(60),
              equals: z.string().trim().min(1).max(200),
              roleName: z.string().trim().min(2).max(40),
            })
          )
          .max(30)
          .optional(),
        syncOnLogin: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No settings to update' })

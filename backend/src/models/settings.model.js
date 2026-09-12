import { Schema, model } from 'mongoose'

/**
 * Platform settings, as one row.
 *
 * A singleton (`_id: 'global'`) rather than a key/value table: the settings
 * are read together on almost every page, they are written by one screen,
 * and a table of loose keys turns "what is configurable" into a query
 * nobody can answer from the code.
 *
 * ## No secrets here
 *
 * SMTP passwords, S3 keys, JWT secrets and API tokens stay in the
 * environment. This document is read by an admin screen, dumped in every
 * backup, and returned by an API — three places a credential should not
 * be. What lives here is the *shape* of a setting ("mail is on, from this
 * address"), never the thing that authenticates it.
 */

const brandingSchema = new Schema(
  {
    appName: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '' },
    loginBackgroundUrl: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    // Covers of the portal's pages (rasm «Фоны и обложки»); empty falls
    // back to the image the deployment ships.
    coursesCoverUrl: { type: String, default: '' },
    catalogCoverUrl: { type: String, default: '' },
    profileCoverUrl: { type: String, default: '' },
    // The portal's top bar, as the administrator arranged it (rasm
    // «Навигационное меню»): which sections, in what order, and which one
    // opens first. Empty means the built-in order.
    portalNav: { type: [{ name: String, enabled: { type: Boolean, default: true } }], default: [] },
    startPage: { type: String, default: '' },
  },
  { _id: false }
)

const mailSchema = new Schema(
  {
    // Whether to send at all. The credentials are in the environment; this
    // is the switch and the visible identity.
    enabled: { type: Boolean, default: true },
    fromName: { type: String, default: '' },
    fromEmail: { type: String, default: '' },
    replyTo: { type: String, default: '' },
    footerText: { type: String, default: '' },
  },
  { _id: false }
)

const notificationSchema = new Schema(
  {
    // Company-wide off switches. A person's own preferences are stored as
    // deviations on their account (§9.3); these sit above them, and neither
    // can turn off a mandatory type.
    emailEnabled: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: true },
    digestHour: { type: Number, min: 0, max: 23, default: 9 },
  },
  { _id: false }
)

const gamificationSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    pointsPerVideo: { type: Number, min: 0, default: 10 },
    pointsPerQuiz: { type: Number, min: 0, default: 20 },
    leaderboardVisible: { type: Boolean, default: true },
  },
  { _id: false }
)

const gradingSchema = new Schema(
  {
    defaultPassScore: { type: Number, min: 0, max: 100, default: 70 },
    defaultMaxAttempts: { type: Number, min: 0, default: 0 },
    // What a new test starts as. Changing it never touches an existing
    // one — a test's own settings are its own (4.2).
    defaultRevealMode: {
      type: String,
      enum: ['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_LAST_ATTEMPT'],
      default: 'AFTER_SUBMIT',
    },
    defaultScorePolicy: { type: String, enum: ['LAST', 'BEST', 'FIRST', 'AVERAGE'], default: 'LAST' },
  },
  { _id: false }
)

const localeSchema = new Schema(
  {
    defaultLang: { type: String, enum: ['uz', 'ru', 'en'], default: 'uz' },
    // Display only. The server stamps every date in UTC and formats in this
    // zone (notificationFormat.js) — storing local times would make a
    // timezone change rewrite history.
    timezone: { type: String, default: 'Asia/Tashkent' },
    weekStartsOn: { type: Number, min: 0, max: 6, default: 1 },
  },
  { _id: false }
)

const securitySchema = new Schema(
  {
    sessionHours: { type: Number, min: 1, max: 720, default: 24 },
    passwordMinLength: { type: Number, min: 8, max: 64, default: 8 },
    requireTwoFactor: { type: Boolean, default: false },
    // 0 disables the lockout. Above 0, that many failed attempts locks the
    // account for `lockoutMinutes`.
    maxLoginAttempts: { type: Number, min: 0, max: 50, default: 0 },
    lockoutMinutes: { type: Number, min: 1, max: 1440, default: 15 },
  },
  { _id: false }
)

/**
 * What the AI features are allowed to spend (10.6).
 *
 * A monthly token ceiling rather than a request limit: generation calls
 * differ by two orders of magnitude (a quiz from one lesson against a
 * course outline from a 200-page manual), so counting requests would
 * either block the cheap ones or let a handful of expensive ones run the
 * bill up. 0 means no limit — which is the default, because a limit
 * somebody did not choose is a feature that stops working in the second
 * month for no visible reason.
 */
const aiSchema = new Schema(
  {
    monthlyTokenBudget: { type: Number, min: 0, default: 0 },
    // Whether authors may start generation jobs at all. Separate from the
    // budget: a company can want AI off entirely without setting a ceiling
    // of zero and reading "budget exceeded" as the reason.
    generationEnabled: { type: Boolean, default: true },
  },
  { _id: false }
)

/**
 * Single sign-on (11.4) — the parts a company configures, not the secrets.
 *
 * The issuer, client id and client secret are in the environment, the same
 * split the mail section uses: a client secret in a settings document is a
 * secret in every backup, in whatever the admin screen renders, and in the
 * first settings response somebody forgets to mask. What lives here is the
 * switch and the **mapping** — which claim carries a department, which
 * group makes somebody an admin — because those are decisions an
 * administrator makes and changes without a deploy.
 */
const ssoSchema = new Schema(
  {
    // Configured (env) and enabled (here) are separate: a half-configured
    // provider must not put a broken button on the login page, and a
    // working one must be switchable off without unsetting credentials.
    enabled: { type: Boolean, default: false },
    // What the button says. A company's employees know "Entra ID" or
    // "korporativ hisob", not "OIDC".
    buttonLabel: { type: String, default: '', trim: true },
    scopes: { type: [String], default: ['openid', 'profile', 'email'] },

    /**
     * Whether an unknown identity may create an account.
     *
     * Off by default. On, the first login provisions the person; off, an
     * identity with no matching account is refused with a message that
     * says so, which is what a company that manages its roster elsewhere
     * wants.
     */
    autoProvision: { type: Boolean, default: false },
    defaultRoleName: { type: String, default: 'EMPLOYEE' },
    /**
     * Domains allowed to sign in at all.
     *
     * A shared identity provider (a tenant with guests, or a provider like
     * Google) will happily authenticate somebody who has nothing to do
     * with this company. Empty means "any domain the provider vouches
     * for", which is only safe with a single-tenant provider.
     */
    allowedEmailDomains: { type: [String], default: [] },

    /**
     * Which claim carries what.
     *
     * Claim names are not standardised beyond a handful: `email` and
     * `name` usually exist, a department almost never does under the same
     * name twice. Configured rather than guessed, so a new provider is a
     * settings change instead of a release.
     */
    claims: {
      type: new Schema(
        {
          // The login identifier. This platform keys people by JSHSHIR, so
          // provisioning needs a claim that carries it — see
          // oidcAuth.service.js on why an account is not invented without
          // one.
          jshshir: { type: String, default: '' },
          email: { type: String, default: 'email' },
          firstName: { type: String, default: 'given_name' },
          lastName: { type: String, default: 'family_name' },
          fullName: { type: String, default: 'name' },
          department: { type: String, default: '' },
          branch: { type: String, default: '' },
          position: { type: String, default: '' },
          employeeNumber: { type: String, default: '' },
        },
        { _id: false }
      ),
      default: () => ({}),
    },

    /**
     * claim → role. First match wins, in order.
     *
     * Ordered rather than "highest role wins": which of two roles is
     * higher is a judgement this model does not have, while the order of a
     * list is something an administrator can see and change.
     */
    roleRules: {
      type: [
        new Schema(
          {
            claim: { type: String, required: true },
            // The value to look for. `equals` matches a string claim;
            // for a list claim (`groups`) it matches if the list contains it.
            equals: { type: String, required: true },
            roleName: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    /**
     * Whether every login refreshes name, department and role from the
     * claims.
     *
     * On by default: the point of SSO with mapping is that the identity
     * provider is the source of truth for who somebody is and where they
     * work, and a platform that reads that once at provisioning drifts
     * from the directory within a quarter. It deliberately does **not**
     * touch `isActive` — deactivating is a decision with consequences
     * (assignments, certificates) and a claim's absence is too weak a
     * signal for it.
     */
    syncOnLogin: { type: Boolean, default: true },
  },
  { _id: false }
)

const settingsSchema = new Schema(
  {
    // A fixed id is what makes this a singleton: there is no way to create
    // a second row by accident, and every read is a primary-key lookup.
    _id: { type: String, default: 'global' },
    branding: { type: brandingSchema, default: () => ({}) },
    mail: { type: mailSchema, default: () => ({}) },
    notifications: { type: notificationSchema, default: () => ({}) },
    gamification: { type: gamificationSchema, default: () => ({}) },
    grading: { type: gradingSchema, default: () => ({}) },
    locale: { type: localeSchema, default: () => ({}) },
    security: { type: securitySchema, default: () => ({}) },
    ai: { type: aiSchema, default: () => ({}) },
    sso: { type: ssoSchema, default: () => ({}) },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, _id: false }
)

export const SETTINGS_SECTIONS = [
  'branding',
  'mail',
  'notifications',
  'gamification',
  'grading',
  'locale',
  'security',
  'ai',
  'sso',
]

export const Settings = model('Settings', settingsSchema)

import { ROLES } from './roles.js'

/**
 * Canonical permission catalogue. RBAC is permission-based at the
 * middleware level (`requirePermission(PERMISSIONS.COURSE_CREATE)`), while
 * the actual role → permission mapping lives in the `roles` collection so
 * it can change without a deploy. `DEFAULT_ROLE_PERMISSIONS` below is only
 * the seed data for the six initial roles.
 */
export const PERMISSIONS = Object.freeze({
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  ROLE_MANAGE: 'role:manage',

  COURSE_CREATE: 'course:create',
  COURSE_READ: 'course:read',
  COURSE_UPDATE: 'course:update',
  COURSE_DELETE: 'course:delete',
  COURSE_ASSIGN: 'course:assign',

  VIDEO_UPLOAD: 'video:upload',
  VIDEO_MANAGE: 'video:manage',
  VIDEO_VIEW: 'video:view',

  ANALYTICS_VIEW_OWN: 'analytics:view:own',
  ANALYTICS_VIEW_ALL: 'analytics:view:all',
  REPORT_EXPORT: 'report:export',

  NEWS_CREATE: 'news:create',
  NEWS_MANAGE: 'news:manage',
  NEWS_READ: 'news:read',

  TASK_CREATE: 'task:create',
  TASK_MANAGE_ALL: 'task:manage:all',
  TASK_READ_OWN: 'task:read:own',

  EVENT_CREATE: 'event:create',
  EVENT_READ: 'event:read',

  NOTIFICATION_READ: 'notification:read',

  AI_CHAT: 'ai:chat',

  // Everyone gets a 1:1 support thread with staff without needing a
  // permission of their own (self-only access, like task:read:own) — this
  // permission gates the *other* side: seeing every employee's thread in
  // the shared admin/manager inbox and replying in any of them.
  CHAT_SUPPORT: 'chat:support',

  // Group threads are the one part of chat that is not symmetric: a DM is
  // opened by either side writing to the other, but a group decides who is
  // in the room, so creating one and changing its roster is gated. Writing
  // *in* a group needs no permission — membership is the rule, exactly as
  // participation is for a DM.
  CHAT_GROUP_MANAGE: 'chat:group:manage',

  AUDIT_READ: 'audit:read',

  // ---- Keys added for the §8.2 role matrix (2.4) ----
  //
  // A number of these gate features that arrive in later blocks — learning
  // paths, the question bank, certificates, the knowledge base, 360°, OJT.
  // They are defined now because the three new roles are defined now, and a
  // role whose permission list has holes in it is a role somebody has to
  // remember to revisit. Until the feature lands, holding the key grants
  // nothing: permissions are only ever consulted by a route that asks for
  // them, so an unused key is inert rather than dangerous.
  //
  // Which are live today is recorded in the checklist entry for 2.4.

  // Publishing is separate from editing: an AUTHOR writes a course, and
  // deciding it is ready for the company is a different decision.
  COURSE_PUBLISH: 'course:publish',

  PATH_READ: 'path:read',
  PATH_MANAGE: 'path:manage',
  PATH_ASSIGN: 'path:assign',

  QUESTION_MANAGE: 'question:manage',
  QUIZ_CONFIGURE: 'quiz:configure',
  // Marking free-text answers, which is a person's judgement rather than a
  // score the system computes.
  QUIZ_GRADE: 'quiz:grade',
  QUIZ_STATS_VIEW: 'quiz:stats:view',

  ASSIGNMENT_MANAGE: 'assignment:manage',
  ASSIGNMENT_SUBMIT: 'assignment:submit',
  ASSIGNMENT_GRADE: 'assignment:grade',

  CERTIFICATE_TEMPLATE_MANAGE: 'certificate:template:manage',
  CERTIFICATE_ISSUE: 'certificate:issue',
  CERTIFICATE_REVOKE: 'certificate:revoke',
  CERTIFICATE_READ_OWN: 'certificate:read:own',
  CERTIFICATE_READ_ALL: 'certificate:read:all',

  EVENT_MANAGE: 'event:manage',
  EVENT_ATTENDANCE_MARK: 'event:attendance:mark',
  EVENT_REGISTER: 'event:register',

  USER_IMPORT: 'user:import',

  ONBOARDING_MANAGE: 'onboarding:manage',
  ONBOARDING_VIEW_TEAM: 'onboarding:view:team',

  KB_READ: 'kb:read',
  KB_WRITE: 'kb:write',
  // Reviewing and publishing an article is deliberately not the same key as
  // writing one — the whole point of a knowledge base is that somebody else
  // checks it.
  KB_PUBLISH: 'kb:publish',

  REVIEW360_MANAGE: 'review360:manage',
  REVIEW360_RESPOND: 'review360:respond',
  REVIEW360_RESULTS_VIEW: 'review360:results:view',

  OJT_MANAGE: 'ojt:manage',
  OJT_OBSERVE: 'ojt:observe',

  DEVPLAN_MANAGE: 'devplan:manage',
  DEVPLAN_READ_OWN: 'devplan:read:own',

  // Distinct from report:export, which already exists: reading a report on
  // screen and downloading the whole population as a file are different
  // risks, and §8.2 grants them to different roles.
  REPORT_VIEW: 'report:view',
  REPORT_SCHEDULE: 'report:schedule',

  COMPLIANCE_VIEW: 'compliance:view',
  AUTOMATION_MANAGE: 'automation:manage',
  MEDIA_MANAGE: 'media:manage',

  SETTINGS_MANAGE: 'settings:manage',
  BRANDING_MANAGE: 'branding:manage',
  // API keys, webhooks and SSO are one key: they are the same decision —
  // letting something outside the company talk to it.
  INTEGRATION_MANAGE: 'integration:manage',

  // Generating content with the AI, as opposed to chatting with it.
  AI_GENERATE: 'ai:generate',

  PROCTOR_VIEW: 'proctor:view',
})

export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

const EMPLOYEE_BASE = [
  PERMISSIONS.COURSE_READ,
  PERMISSIONS.VIDEO_VIEW,
  PERMISSIONS.NEWS_READ,
  PERMISSIONS.TASK_READ_OWN,
  PERMISSIONS.EVENT_READ,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.AI_CHAT,
  PERMISSIONS.ANALYTICS_VIEW_OWN,
  // Everything the §8.2 matrix marks ✔ for LEARNER: what an employee does
  // to their own learning rather than to anyone else's.
  PERMISSIONS.PATH_READ,
  PERMISSIONS.ASSIGNMENT_SUBMIT,
  PERMISSIONS.CERTIFICATE_READ_OWN,
  PERMISSIONS.EVENT_REGISTER,
  PERMISSIONS.KB_READ,
  PERMISSIONS.REVIEW360_RESPOND,
  PERMISSIONS.DEVPLAN_READ_OWN,
]

const MANAGER_PERMISSIONS = [
  ...EMPLOYEE_BASE,
  PERMISSIONS.USER_CREATE,
  PERMISSIONS.USER_READ,
  PERMISSIONS.COURSE_ASSIGN,
  PERMISSIONS.VIDEO_UPLOAD,
  PERMISSIONS.VIDEO_MANAGE,
  PERMISSIONS.ANALYTICS_VIEW_ALL,
  PERMISSIONS.REPORT_EXPORT,
  PERMISSIONS.NEWS_CREATE,
  PERMISSIONS.TASK_CREATE,
  PERMISSIONS.TASK_MANAGE_ALL,
  PERMISSIONS.EVENT_CREATE,
  PERMISSIONS.CHAT_SUPPORT,
  PERMISSIONS.CHAT_GROUP_MANAGE,
  // The §8.2 rows marked `~` for MANAGER: the same actions an admin has,
  // fenced to the people they answer for. The fence is role.scope (2.2),
  // not a different permission key.
  PERMISSIONS.PATH_ASSIGN,
  PERMISSIONS.QUIZ_GRADE,
  PERMISSIONS.QUIZ_STATS_VIEW,
  PERMISSIONS.ASSIGNMENT_MANAGE,
  PERMISSIONS.ASSIGNMENT_GRADE,
  PERMISSIONS.CERTIFICATE_READ_ALL,
  PERMISSIONS.EVENT_MANAGE,
  PERMISSIONS.EVENT_ATTENDANCE_MARK,
  PERMISSIONS.ONBOARDING_VIEW_TEAM,
  PERMISSIONS.OJT_MANAGE,
  PERMISSIONS.OJT_OBSERVE,
  PERMISSIONS.DEVPLAN_MANAGE,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.COMPLIANCE_VIEW,
  PERMISSIONS.REVIEW360_RESULTS_VIEW,
  PERMISSIONS.PROCTOR_VIEW,
]

const ADMIN_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  PERMISSIONS.USER_UPDATE,
  PERMISSIONS.USER_DELETE,
  PERMISSIONS.COURSE_CREATE,
  PERMISSIONS.COURSE_UPDATE,
  PERMISSIONS.COURSE_DELETE,
  PERMISSIONS.NEWS_MANAGE,
  PERMISSIONS.AUDIT_READ,
  // §8.2 gives ADMIN everything except three rows: configuring roles,
  // configuring settings/branding, and managing API keys, webhooks and SSO.
  // Those stay SUPERADMIN — they are the keys that decide who else can do
  // anything, and what the company looks like from outside.
  PERMISSIONS.COURSE_PUBLISH,
  PERMISSIONS.PATH_MANAGE,
  PERMISSIONS.PATH_ASSIGN,
  PERMISSIONS.QUESTION_MANAGE,
  PERMISSIONS.QUIZ_CONFIGURE,
  PERMISSIONS.QUIZ_GRADE,
  PERMISSIONS.QUIZ_STATS_VIEW,
  PERMISSIONS.ASSIGNMENT_MANAGE,
  PERMISSIONS.ASSIGNMENT_GRADE,
  PERMISSIONS.CERTIFICATE_TEMPLATE_MANAGE,
  PERMISSIONS.CERTIFICATE_ISSUE,
  PERMISSIONS.CERTIFICATE_REVOKE,
  PERMISSIONS.CERTIFICATE_READ_ALL,
  PERMISSIONS.EVENT_MANAGE,
  PERMISSIONS.EVENT_ATTENDANCE_MARK,
  PERMISSIONS.USER_IMPORT,
  PERMISSIONS.ONBOARDING_MANAGE,
  PERMISSIONS.ONBOARDING_VIEW_TEAM,
  PERMISSIONS.KB_WRITE,
  PERMISSIONS.KB_PUBLISH,
  PERMISSIONS.REVIEW360_MANAGE,
  PERMISSIONS.REVIEW360_RESULTS_VIEW,
  PERMISSIONS.OJT_MANAGE,
  PERMISSIONS.OJT_OBSERVE,
  PERMISSIONS.DEVPLAN_MANAGE,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.REPORT_SCHEDULE,
  PERMISSIONS.COMPLIANCE_VIEW,
  PERMISSIONS.AUTOMATION_MANAGE,
  PERMISSIONS.MEDIA_MANAGE,
  PERMISSIONS.AI_GENERATE,
  PERMISSIONS.PROCTOR_VIEW,
]

// The three roles §8.2 describes and the platform did not have. Each is a
// person who does one specific job with courses and never a general admin —
// which is the whole reason they exist: today the only way to let somebody
// write a course is to make them an ADMIN, and that hands them the employee
// records too.

// Writes the material. Everything about content, nothing about people.
const AUTHOR_PERMISSIONS = [
  ...EMPLOYEE_BASE,
  PERMISSIONS.COURSE_CREATE,
  PERMISSIONS.COURSE_UPDATE,
  PERMISSIONS.PATH_MANAGE,
  PERMISSIONS.QUESTION_MANAGE,
  PERMISSIONS.QUIZ_CONFIGURE,
  PERMISSIONS.QUIZ_GRADE,
  PERMISSIONS.QUIZ_STATS_VIEW,
  PERMISSIONS.ASSIGNMENT_MANAGE,
  PERMISSIONS.ASSIGNMENT_GRADE,
  PERMISSIONS.KB_WRITE,
  PERMISSIONS.MEDIA_MANAGE,
  PERMISSIONS.AI_GENERATE,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.VIDEO_UPLOAD,
  PERMISSIONS.VIDEO_MANAGE,
  // Deliberately not COURSE_PUBLISH or COURSE_DELETE: writing a course and
  // deciding the company must take it are different decisions.
]

// Teaches it. Runs sessions and marks work, does not write the material.
const INSTRUCTOR_PERMISSIONS = [
  ...EMPLOYEE_BASE,
  PERMISSIONS.COURSE_ASSIGN,
  PERMISSIONS.QUESTION_MANAGE,
  PERMISSIONS.QUIZ_CONFIGURE,
  PERMISSIONS.QUIZ_GRADE,
  PERMISSIONS.QUIZ_STATS_VIEW,
  PERMISSIONS.ASSIGNMENT_MANAGE,
  PERMISSIONS.ASSIGNMENT_GRADE,
  PERMISSIONS.EVENT_CREATE,
  PERMISSIONS.EVENT_MANAGE,
  PERMISSIONS.EVENT_ATTENDANCE_MARK,
  PERMISSIONS.OJT_OBSERVE,
  PERMISSIONS.REPORT_VIEW,
]

// Looks after specific people. The only one of the three that may read
// employee records — which is why it is the only one scoped to a TEAM.
const MENTOR_PERMISSIONS = [
  ...EMPLOYEE_BASE,
  PERMISSIONS.USER_READ,
  PERMISSIONS.QUIZ_STATS_VIEW,
  PERMISSIONS.ASSIGNMENT_GRADE,
  PERMISSIONS.ONBOARDING_VIEW_TEAM,
  PERMISSIONS.OJT_OBSERVE,
  PERMISSIONS.DEVPLAN_MANAGE,
  PERMISSIONS.REPORT_VIEW,
]

// The sets above are built by spreading one another, so a key can appear
// twice. Harmless for the seed ($addToSet) but confusing to read back off a
// role document, and it makes "how many permissions does ADMIN have" a
// nonsense number.
const unique = (keys) => Object.freeze([...new Set(keys)])

/** Seed data only — the `roles` collection governs actual authorization at runtime. */
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPERADMIN]: unique([...ALL_PERMISSIONS, PERMISSIONS.ROLE_MANAGE]),
  [ROLES.ADMIN]: unique(ADMIN_PERMISSIONS),
  [ROLES.MANAGER]: unique(MANAGER_PERMISSIONS),
  [ROLES.AUTHOR]: unique(AUTHOR_PERMISSIONS),
  [ROLES.INSTRUCTOR]: unique(INSTRUCTOR_PERMISSIONS),
  [ROLES.MENTOR]: unique(MENTOR_PERMISSIONS),
  [ROLES.EMPLOYEE]: unique(EMPLOYEE_BASE),
  [ROLES.CALL_OPERATOR]: unique(EMPLOYEE_BASE),
  [ROLES.SELLER]: unique(EMPLOYEE_BASE),
})

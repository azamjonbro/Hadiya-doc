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

  AUDIT_READ: 'audit:read',
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
]

/** Seed data only — the `roles` collection governs actual authorization at runtime. */
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPERADMIN]: [...ALL_PERMISSIONS, PERMISSIONS.ROLE_MANAGE],
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.EMPLOYEE]: EMPLOYEE_BASE,
  [ROLES.CALL_OPERATOR]: EMPLOYEE_BASE,
  [ROLES.SELLER]: EMPLOYEE_BASE,
})

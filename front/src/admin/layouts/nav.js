export const workspaceNav = [{ name: 'dashboard', path: '/bos', icon: 'home', labelKey: 'nav.dashboard' }]

export const managementNav = [
  { name: 'team', path: '/bos/team', icon: 'users', labelKey: 'team.title', permission: 'analytics:view:all' },
  { name: 'users', path: '/bos/users', icon: 'users', labelKey: 'nav.employees', permission: 'user:read' },
  { name: 'branches', path: '/bos/branches', icon: 'building', labelKey: 'nav.branches', permission: 'user:read' },
  { name: 'groups', path: '/bos/groups', icon: 'layers', labelKey: 'nav.groups', permission: 'user:read' },
  { name: 'courses', path: '/bos/courses', icon: 'book-open', labelKey: 'admin.nav.courses', permission: 'course:read' },
  {
    name: 'leaderboard',
    path: '/bos/leaderboard',
    icon: 'award',
    labelKey: 'nav.leaderboard',
    permission: 'analytics:view:all',
  },
  { name: 'news', path: '/bos/news', icon: 'newspaper', labelKey: 'nav.news', permission: 'news:read' },
  { name: 'tasks', path: '/bos/tasks', icon: 'check-square', labelKey: 'nav.tasks', permission: 'task:create' },
  { name: 'reports', path: '/bos/reports', icon: 'bar-chart', labelKey: 'nav.reports', permission: 'report:export' },
  { name: 'chat', path: '/bos/chat', icon: 'message-square', labelKey: 'nav.chat', permission: 'chat:support' },
  { name: 'events', path: '/bos/events', icon: 'calendar', labelKey: 'events.adminTitle', permission: 'event:create' },
  {
    name: 'paths',
    path: '/bos/paths',
    icon: 'layers',
    labelKey: 'paths.adminTitle',
    permission: 'path:manage',
  },
  {
    name: 'question-banks',
    path: '/bos/question-banks',
    icon: 'check-square',
    labelKey: 'questions.title',
    permission: 'quiz:configure',
  },
  {
    name: 'certificates',
    path: '/bos/certificates',
    icon: 'award',
    labelKey: 'nav.certificates',
    permission: 'certificate:template:manage',
  },
  { name: 'roles', path: '/bos/roles', icon: 'lock', labelKey: 'roles.title', permission: 'role:manage' },
  { name: 'audit-logs', path: '/bos/audit-logs', icon: 'shield', labelKey: 'nav.auditLog', permission: 'audit:read' },
  { name: 'trash', path: '/bos/trash', icon: 'trash', labelKey: 'nav.trash', permission: 'course:delete' },
]

export const systemNav = [
  { name: 'notifications', path: '/bos/notifications', icon: 'bell', labelKey: 'nav.notifications' },
  { name: 'settings', path: '/bos/settings', icon: 'settings', labelKey: 'nav.settings' },
]

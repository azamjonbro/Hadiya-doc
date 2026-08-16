export const workspaceNav = [{ name: 'dashboard', path: '/bos', icon: 'home', labelKey: 'nav.dashboard' }]

export const managementNav = [
  { name: 'users', path: '/bos/users', icon: 'users', labelKey: 'nav.employees', permission: 'user:read' },
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
  { name: 'trash', path: '/bos/trash', icon: 'trash', labelKey: 'nav.trash', permission: 'course:delete' },
]

export const systemNav = [
  { name: 'notifications', path: '/bos/notifications', icon: 'bell', labelKey: 'nav.notifications' },
  { name: 'settings', path: '/bos/settings', icon: 'settings', labelKey: 'nav.settings' },
]

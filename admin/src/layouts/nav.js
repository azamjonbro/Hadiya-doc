export const workspaceNav = [{ name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard' }]

export const managementNav = [
  { name: 'users', path: '/admin/users', icon: 'users', labelKey: 'nav.employees', permission: 'user:read' },
  { name: 'groups', path: '/admin/groups', icon: 'layers', labelKey: 'nav.groups', permission: 'user:read' },
  { name: 'courses', path: '/admin/courses', icon: 'book-open', labelKey: 'nav.courses', permission: 'course:read' },
  {
    name: 'leaderboard',
    path: '/admin/leaderboard',
    icon: 'award',
    labelKey: 'nav.leaderboard',
    permission: 'analytics:view:all',
  },
  { name: 'news', path: '/admin/news', icon: 'newspaper', labelKey: 'nav.news', permission: 'news:read' },
  { name: 'tasks', path: '/admin/tasks', icon: 'check-square', labelKey: 'nav.tasks', permission: 'task:create' },
  { name: 'reports', path: '/admin/reports', icon: 'bar-chart', labelKey: 'nav.reports', permission: 'report:export' },
  { name: 'chat', path: '/admin/chat', icon: 'message-square', labelKey: 'nav.chat', permission: 'chat:support' },
]

export const systemNav = [
  { name: 'notifications', path: '/notifications', icon: 'bell', labelKey: 'nav.notifications' },
  { name: 'settings', path: '/settings', icon: 'settings', labelKey: 'nav.settings' },
]

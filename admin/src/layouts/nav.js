export const workspaceNav = [{ name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard' }]

export const managementNav = [
  { name: 'users', path: '/admin/users', icon: 'users', labelKey: 'nav.employees', permission: 'user:read' },
  { name: 'courses', path: '/admin/courses', icon: 'book-open', labelKey: 'nav.courses', permission: 'course:read' },
  { name: 'news', path: '/admin/news', icon: 'newspaper', labelKey: 'nav.news', permission: 'news:read' },
  { name: 'tasks', path: '/admin/tasks', icon: 'check-square', labelKey: 'nav.tasks', permission: 'task:create' },
  { name: 'reports', path: '/admin/reports', icon: 'bar-chart', labelKey: 'nav.reports', permission: 'report:export' },
]

export const systemNav = [
  { name: 'notifications', path: '/notifications', icon: 'bell', labelKey: 'nav.notifications' },
  { name: 'settings', path: '/settings', icon: 'settings', labelKey: 'nav.settings' },
]

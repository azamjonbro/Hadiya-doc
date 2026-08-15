export const workspaceNav = [
  { name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard' },
  { name: 'courses', path: '/courses', icon: 'book-open', labelKey: 'nav.courses' },
  { name: 'news', path: '/news', icon: 'newspaper', labelKey: 'nav.news' },
  { name: 'tasks', path: '/tasks', icon: 'check-square', labelKey: 'nav.tasks', permission: 'task:read:own' },
  { name: 'events', path: '/events', icon: 'calendar', labelKey: 'nav.events', permission: 'event:read' },
  { name: 'leaderboard', path: '/leaderboard', icon: 'award', labelKey: 'nav.leaderboard' },
  { name: 'chat', path: '/chat', icon: 'message-square', labelKey: 'nav.chat' },
]

export const systemNav = [
  { name: 'notifications', path: '/notifications', icon: 'bell', labelKey: 'nav.notifications' },
  { name: 'settings', path: '/settings', icon: 'settings', labelKey: 'nav.settings' },
]

export const bottomNav = [
  { name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard' },
  { name: 'courses', path: '/courses', icon: 'book-open', labelKey: 'nav.courses' },
  { name: 'tasks', path: '/tasks', icon: 'check-square', labelKey: 'nav.tasks' },
  { name: 'news', path: '/news', icon: 'newspaper', labelKey: 'nav.news' },
]

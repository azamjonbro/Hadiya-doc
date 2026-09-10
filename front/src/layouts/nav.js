export const workspaceNav = [
  { name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard' },
  { name: 'courses', path: '/courses', icon: 'book-open', labelKey: 'nav.courses' },
  { name: 'news', path: '/news', icon: 'newspaper', labelKey: 'nav.news' },
  { name: 'tasks', path: '/tasks', icon: 'check-square', labelKey: 'nav.tasks', permission: 'task:read:own' },
  { name: 'calendar', path: '/calendar', icon: 'calendar', labelKey: 'nav.calendar' },
  { name: 'events', path: '/events', icon: 'calendar', labelKey: 'nav.events', permission: 'event:read' },
  { name: 'paths', path: '/paths', icon: 'layers', labelKey: 'nav.paths', permission: 'path:read' },
  { name: 'certificates', path: '/certificates', icon: 'award', labelKey: 'nav.certificates' },
  // BLOK 13. Three of these are permission-gated because most employees are
  // never a rater or an observer, and an empty page in the sidebar reads as
  // a broken feature rather than an absent one.
  { name: 'competencies', path: '/competencies', icon: 'star', labelKey: 'competency.mine' },
  { name: 'reviews', path: '/reviews', icon: 'refresh', labelKey: 'review360.mine', permission: 'review360:respond' },
  { name: 'ojt', path: '/ojt', icon: 'briefcase', labelKey: 'ojt.title', permission: 'ojt:observe' },
  {
    name: 'development-plan',
    path: '/development-plan',
    icon: 'trending-up',
    labelKey: 'devplan.mine',
    permission: 'devplan:read:own',
  },
  { name: 'leaderboard', path: '/leaderboard', icon: 'trending-up', labelKey: 'nav.leaderboard' },
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

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

// The portal's top bar (docs/v4/06-learner-portal-reference.md §0, §12).
// Five links sit in the bar itself; everything else lives behind "···" in
// three named columns, the way iSpring groups it, so an employee with
// twelve pages does not get twelve tabs. `permission` hides a link the
// person could not use — an empty page reads as a broken feature.
export const portalPrimaryNav = [
  { name: 'courses', path: '/courses', labelKey: 'portal.nav.myCourses' },
  { name: 'news', path: '/news', labelKey: 'nav.news' },
  { name: 'catalog', path: '/catalog', labelKey: 'portal.nav.catalog' },
  { name: 'development-plan', path: '/development-plan', labelKey: 'devplan.mine', permission: 'devplan:read:own' },
  { name: 'kb', path: '/kb', labelKey: 'portal.nav.kb' },
]

export const portalMenuGroups = [
  {
    labelKey: 'portal.nav.groupLearning',
    items: [
      { name: 'courses', path: '/courses', labelKey: 'portal.nav.myCourses' },
      { name: 'events', path: '/events', labelKey: 'nav.events', permission: 'event:read' },
      { name: 'catalog', path: '/catalog', labelKey: 'portal.nav.catalog' },
      { name: 'kb', path: '/kb', labelKey: 'portal.nav.kb' },
      { name: 'ojt', path: '/ojt', labelKey: 'ojt.title', permission: 'ojt:observe' },
      { name: 'grading', path: '/grading', labelKey: 'portal.nav.grading', permission: 'quiz:grade' },
      { name: 'paths', path: '/paths', labelKey: 'nav.paths', permission: 'path:read' },
      { name: 'tasks', path: '/tasks', labelKey: 'nav.tasks', permission: 'task:read:own' },
      { name: 'calendar', path: '/calendar', labelKey: 'nav.calendar' },
    ],
  },
  {
    labelKey: 'portal.nav.groupCompany',
    items: [
      { name: 'news', path: '/news', labelKey: 'nav.news' },
      { name: 'chat', path: '/chat', labelKey: 'nav.chat' },
      { name: 'leaderboard', path: '/leaderboard', labelKey: 'nav.leaderboard' },
    ],
  },
  {
    labelKey: 'portal.nav.groupDevelopment',
    items: [
      { name: 'development-plan', path: '/development-plan', labelKey: 'devplan.mine', permission: 'devplan:read:own' },
      { name: 'competencies', path: '/competencies', labelKey: 'competency.mine' },
      { name: 'reviews', path: '/reviews', labelKey: 'review360.mine', permission: 'review360:respond' },
      { name: 'certificates', path: '/certificates', labelKey: 'nav.certificates' },
    ],
  },
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

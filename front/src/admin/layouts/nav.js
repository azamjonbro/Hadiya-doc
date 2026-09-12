// The admin shell (rasn/ 2026-09-11, iSpring's admin): a narrow icon rail
// on the left, one icon per section, and a second column naming the pages
// of the current section. A section with one page has no second column —
// the page takes the width. `permission` hides what the person could not
// open; a section whose every page is hidden disappears with them.
export const adminSections = [
  { key: 'home', icon: 'home', path: '/bos', labelKey: 'nav.dashboard' },
  {
    key: 'materials',
    icon: 'book-open',
    path: '/bos/courses',
    labelKey: 'admin.section.materials',
    children: [
      { name: 'courses', path: '/bos/courses', labelKey: 'admin.section.library', permission: 'course:read' },
      { name: 'paths', path: '/bos/paths', labelKey: 'paths.adminTitle', permission: 'path:manage' },
      { name: 'question-banks', path: '/bos/question-banks', labelKey: 'questions.title', permission: 'quiz:configure' },
      { name: 'tasks', path: '/bos/tasks', labelKey: 'nav.tasks', permission: 'task:create' },
      { name: 'media', path: '/bos/media', labelKey: 'media.title', permission: 'course:update' },
      { name: 'ai', path: '/bos/ai', labelKey: 'ai.title', permission: 'course:create' },
      { name: 'certificates', path: '/bos/certificates', labelKey: 'nav.certificates', permission: 'certificate:template:manage' },
      { name: 'trash', path: '/bos/trash', labelKey: 'nav.trash', permission: 'course:delete' },
    ],
  },
  { key: 'events', icon: 'calendar', path: '/bos/events', labelKey: 'events.adminTitle', permission: 'event:create' },
  {
    key: 'users',
    icon: 'users',
    path: '/bos/users',
    labelKey: 'admin.section.users',
    children: [
      { name: 'users', path: '/bos/users', labelKey: 'nav.employees', permission: 'user:read' },
      { name: 'roles', path: '/bos/roles', labelKey: 'roles.title', permission: 'role:manage' },
      { name: 'branches', path: '/bos/branches', labelKey: 'nav.branches', permission: 'user:read' },
      { name: 'groups', path: '/bos/groups', labelKey: 'nav.groups', permission: 'user:read' },
      { name: 'team', path: '/bos/team', labelKey: 'team.title', permission: 'analytics:view:all' },
      { name: 'compliance', path: '/bos/compliance', labelKey: 'compliance.title', permission: 'course:assign' },
    ],
  },
  {
    key: 'development',
    icon: 'trending-up',
    path: '/bos/development-plans',
    labelKey: 'admin.section.development',
    children: [
      { name: 'development-plans', path: '/bos/development-plans', labelKey: 'devplan.adminTitle', permission: 'devplan:manage' },
      { name: 'development-plan-drafts', path: '/bos/development-plans/drafts', labelKey: 'devplan.drafts.title', permission: 'devplan:manage' },
      { name: 'development-plan-templates', path: '/bos/development-plans/templates', labelKey: 'devplan.templates.title', permission: 'devplan:manage' },
      { name: 'development-plan-types', path: '/bos/development-plans/types', labelKey: 'devplan.types.title', permission: 'devplan:manage' },
    ],
  },
  {
    key: 'reports',
    icon: 'bar-chart',
    path: '/bos/reports',
    labelKey: 'nav.reports',
    children: [
      { name: 'reports', path: '/bos/reports', labelKey: 'nav.reports', permission: 'report:export' },
      { name: 'leaderboard', path: '/bos/leaderboard', labelKey: 'nav.leaderboard', permission: 'analytics:view:all' },
      { name: 'audit-logs', path: '/bos/audit-logs', labelKey: 'nav.auditLog', permission: 'audit:read' },
    ],
  },
  // The knowledge base is one shell for everyone (portal §5); the admin
  // reaches it through the rail like iSpring does.
  { key: 'kb', icon: 'info', path: '/kb', labelKey: 'portal.nav.kb' },
  {
    key: 'questions',
    icon: 'message-square',
    path: '/bos/questions',
    labelKey: 'admin.qa.title',
    children: [
      { name: 'questions', path: '/bos/questions', labelKey: 'admin.qa.title', permission: 'course:update' },
      { name: 'grading', path: '/bos/grading', labelKey: 'grading.title', permission: 'quiz:grade' },
    ],
  },
  {
    key: 'ojt',
    icon: 'check-square',
    path: '/bos/ojt/sessions',
    labelKey: 'ojt.title',
    children: [
      { name: 'ojt-sessions', path: '/bos/ojt/sessions', labelKey: 'ojt.sessionsTitle', permission: 'ojt:manage' },
      { name: 'ojt', path: '/bos/ojt', labelKey: 'ojt.adminTitle', permission: 'ojt:manage' },
      { name: 'ojt-scales', path: '/bos/ojt/scales', labelKey: 'ojt.scales.title', permission: 'ojt:manage' },
    ],
  },
  // Rasn 23: "staff appraisal" holds the 360° sessions and the
  // competency profiles they are scored against.
  {
    key: 'review360',
    icon: 'refresh',
    path: '/bos/review360',
    labelKey: 'admin.section.appraisal',
    children: [
      { name: 'review360', path: '/bos/review360', labelKey: 'review360.sessions', permission: 'review360:manage' },
      { name: 'competency-matrix', path: '/bos/competencies/matrix', labelKey: 'competency.profiles', permission: 'competency:assess' },
      { name: 'competencies', path: '/bos/competencies', labelKey: 'competency.title', permission: 'competency:manage' },
    ],
  },
  {
    key: 'news',
    icon: 'newspaper',
    path: '/bos/news',
    labelKey: 'admin.section.news',
    children: [
      { name: 'news', path: '/bos/news', labelKey: 'nav.news', permission: 'news:read' },
      { name: 'news-comments', path: '/bos/news/comments', labelKey: 'portal.newsDetail.comments', permission: 'news:manage' },
      { name: 'news-banners', path: '/bos/news/banners', labelKey: 'news.banners.title', permission: 'news:manage' },
      { name: 'chat', path: '/bos/chat', labelKey: 'nav.chat', permission: 'chat:support' },
    ],
  },
  {
    key: 'settings',
    icon: 'settings',
    path: '/bos/settings',
    labelKey: 'nav.settings',
    children: [
      { name: 'settings', path: '/bos/settings', labelKey: 'nav.settings' },
      { name: 'notifications', path: '/bos/notifications', labelKey: 'nav.notifications' },
    ],
  },
]

// Which section a path belongs to — the longest matching prefix wins, so
// /bos/competencies/matrix lands in "development", not in "home".
export function sectionFor(path) {
  let best = null
  let bestLength = -1
  for (const section of adminSections) {
    const paths = [section.path, ...(section.children ?? []).map((c) => c.path)]
    for (const p of paths) {
      const matches = p === '/bos' ? path === '/bos' : path === p || path.startsWith(`${p}/`)
      if (matches && p.length > bestLength) {
        best = section
        bestLength = p.length
      }
    }
  }
  return best ?? adminSections[0]
}

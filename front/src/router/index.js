import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'

// The admin area, formerly its own SPA on its own hostname. Same bundle now,
// kept in its own folder and behind its own shell so the two sets of pages
// don't blur into each other. Route names carry an `admin-` prefix because a
// dozen of them (dashboard, courses-list, settings, ...) exist on both sides.
import AdminShell from '@/admin/layouts/AppShell.vue'

// Route components are loaded on demand. Everything used to sit in one chunk:
// an employee downloaded all eighteen admin pages before their dashboard could
// paint, and the entry bundle was 1.4MB. The two layout shells stay eager —
// they wrap every page in their tree, so deferring them would only put a round
// trip in front of the first render.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/403', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue'), meta: { public: true } },
    { path: '/401', name: 'unauthorized', component: () => import('@/views/UnauthorizedView.vue'), meta: { public: true } },
    // Where the QR code on a printed certificate points. Public, and
    // outside the app shell: whoever opens it is holding paper, not an
    // account, and a login prompt would make the page useless.
    {
      path: '/verify/:serial?',
      name: 'verify-certificate',
      component: () => import('@/views/VerifyCertificateView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'dashboard', component: () => import('@/views/HomeView.vue'), meta: { titleKey: 'nav.dashboard' } },
        { path: 'courses', name: 'courses-list', component: () => import('@/views/CoursesView.vue'), meta: { titleKey: 'nav.courses' } },
        { path: 'courses/:id', name: 'course-detail', component: () => import('@/views/CourseDetailView.vue'), meta: { titleKey: 'courses.title' } },
        { path: 'videos/:id', name: 'video-detail', component: () => import('@/views/VideoPlayerView.vue'), meta: { titleKey: 'nav.courses' } },
        {
          path: 'videos/:id/quiz',
          name: 'video-quiz',
          component: () => import('@/views/VideoQuizView.vue'),
          meta: { titleKey: 'nav.courses' },
        },
        {
          path: 'assessments/:id',
          name: 'assessment-detail',
          component: () => import('@/views/AssessmentView.vue'),
          meta: { titleKey: 'nav.courses' },
        },
        { path: 'news', name: 'news-list', component: () => import('@/views/NewsView.vue'), meta: { titleKey: 'nav.news' } },
        { path: 'news/:id', name: 'news-detail', component: () => import('@/views/NewsDetailView.vue'), meta: { titleKey: 'nav.news' } },
        { path: 'tasks', name: 'tasks-list', component: () => import('@/views/TasksView.vue'), meta: { titleKey: 'nav.tasks', permission: 'task:read:own' } },
        { path: 'events', name: 'events-list', component: () => import('@/views/EventsView.vue'), meta: { titleKey: 'nav.events', permission: 'event:read' } },
        { path: 'leaderboard', name: 'leaderboard', component: () => import('@/views/LeaderboardView.vue'), meta: { titleKey: 'nav.leaderboard' } },
        { path: 'chat', name: 'chat', component: () => import('@/views/ChatView.vue'), meta: { titleKey: 'nav.chat' } },
        { path: 'notifications', name: 'notifications', component: () => import('@/views/NotificationsView.vue'), meta: { titleKey: 'nav.notifications' } },
        { path: 'certificates', name: 'certificates', component: () => import('@/views/CertificatesView.vue'), meta: { titleKey: 'nav.certificates' } },
        { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { titleKey: 'nav.settings' } },
      ],
    },
    {
      path: '/bos',
      component: AdminShell,
      // Inherited by every child: the guard checks it once, here, instead of
      // being repeated on eighteen routes. `admin: true` now means SUPERADMIN
      // and nobody else — see the guard.
      meta: { admin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('@/admin/views/HomeView.vue'), meta: { titleKey: 'nav.dashboard' } },
        {
          path: 'users',
          name: 'admin-users-list',
          component: () => import('@/admin/views/UsersListView.vue'),
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'users/:id',
          name: 'admin-user-detail',
          component: () => import('@/admin/views/UserDetailView.vue'),
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'branches',
          name: 'admin-branches-list',
          component: () => import('@/admin/views/BranchesListView.vue'),
          meta: { permission: 'user:read', titleKey: 'branchesPage.title' },
        },
        {
          path: 'groups',
          name: 'admin-groups-list',
          component: () => import('@/admin/views/GroupsListView.vue'),
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'groups/:id',
          name: 'admin-group-detail',
          component: () => import('@/admin/views/GroupDetailView.vue'),
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'leaderboard',
          name: 'admin-leaderboard',
          component: () => import('@/admin/views/LeaderboardView.vue'),
          meta: { permission: 'analytics:view:all', titleKey: 'nav.leaderboard' },
        },
        {
          path: 'courses',
          name: 'admin-courses-list',
          component: () => import('@/admin/views/CoursesListView.vue'),
          meta: { permission: 'course:read', titleKey: 'admin.nav.courses' },
        },
        {
          path: 'courses/new',
          name: 'admin-course-builder',
          component: () => import('@/admin/views/CourseBuilderView.vue'),
          meta: { permission: 'course:create', titleKey: 'courseBuilder.title' },
        },
        {
          path: 'courses/:id',
          name: 'admin-course-detail',
          component: () => import('@/admin/views/CourseDetailView.vue'),
          meta: { permission: 'course:read', titleKey: 'admin.nav.courses' },
        },
        {
          path: 'news',
          name: 'admin-news-list',
          component: () => import('@/admin/views/NewsListView.vue'),
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'news/:id',
          name: 'admin-news-detail',
          component: () => import('@/admin/views/NewsDetailView.vue'),
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'tasks',
          name: 'admin-tasks-list',
          component: () => import('@/admin/views/TasksListView.vue'),
          meta: { permission: 'task:create', titleKey: 'nav.tasks' },
        },
        {
          path: 'reports',
          name: 'admin-reports',
          component: () => import('@/admin/views/ReportsView.vue'),
          meta: { permission: 'report:export', titleKey: 'nav.reports' },
        },
        {
          path: 'team',
          name: 'admin-team-dashboard',
          component: () => import('@/admin/views/ManagerDashboardView.vue'),
          meta: { permission: 'analytics:view:all', titleKey: 'team.title' },
        },
        {
          path: 'roles',
          name: 'admin-roles',
          component: () => import('@/admin/views/RolesPermissionsView.vue'),
          meta: { permission: 'role:manage', titleKey: 'roles.title' },
        },
        {
          path: 'question-banks',
          name: 'admin-question-banks',
          component: () => import('@/admin/views/QuestionBanksView.vue'),
          meta: { permission: 'quiz:configure', titleKey: 'questions.title' },
        },
        {
          path: 'quizzes/:id',
          name: 'admin-quiz-editor',
          component: () => import('@/admin/views/QuizEditorView.vue'),
          meta: { permission: 'quiz:configure', titleKey: 'quizEditor.tabs.questions' },
        },
        {
          path: 'certificates',
          name: 'admin-certificates',
          component: () => import('@/admin/views/CertificateTemplatesView.vue'),
          meta: { permission: 'certificate:template:manage', titleKey: 'nav.certificates' },
        },
        {
          path: 'audit-logs',
          name: 'admin-audit-logs',
          component: () => import('@/admin/views/AuditLogView.vue'),
          meta: { permission: 'audit:read', titleKey: 'nav.auditLog' },
        },
        {
          path: 'chat',
          name: 'admin-chat-inbox',
          component: () => import('@/admin/views/ChatInboxView.vue'),
          meta: { permission: 'chat:support', titleKey: 'nav.chat' },
        },
        {
          path: 'trash',
          name: 'admin-trash',
          component: () => import('@/admin/views/TrashView.vue'),
          meta: { permission: 'course:delete', titleKey: 'nav.trash' },
        },
        {
          path: 'notifications',
          name: 'admin-notifications',
          component: () => import('@/admin/views/NotificationsView.vue'),
          meta: { titleKey: 'nav.notifications' },
        },
        { path: 'settings', name: 'admin-settings', component: () => import('@/admin/views/SettingsView.vue'), meta: { titleKey: 'nav.settings' } },
      ],
    },
    // The admin panel used to live here. Kept as a redirect rather than
    // deleted: bookmarks, the springadmin.techinfo.uz redirect and anything
    // else pointing at the old paths still arrive in the right place. The
    // guard on /bos is what decides whether they may actually come in.
    {
      path: '/admin/:pathMatch(.*)*',
      redirect: (to) => ({ path: '/bos/' + (to.params.pathMatch ?? []).join('/') }),
    },

    // Deliberately NOT public. A signed-in user should see
    // the 404; a signed-out visitor should see the login form, not a dead end
    // with nothing to click. The guard below tells the two apart.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
})

// Where a signed-in user belongs when they land on /login or finish signing in.
// ADMIN and MANAGER go to the employee side now: the admin panel is SUPERADMIN
// only, so sending them to a page they would be bounced off is worse than
// useless.
export function homeRouteFor(auth) {
  return auth.isSuperAdmin ? { name: 'admin-dashboard' } : { name: 'dashboard' }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // main.js starts this without waiting; the first navigation is where the
  // answer is actually needed, so this is where it is waited for.
  await auth.ensureSession()

  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) return homeRouteFor(auth)
    return true
  }

  if (!auth.isAuthenticated) {
    // No `redirect` for a URL that matches nothing: carrying it would send the
    // user straight back to the 404 the moment they finished signing in.
    if (to.name === 'not-found') return { name: 'login' }
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Who may open /bos: anyone holding a permission that some admin page
  // needs. Until 2.5 this was SUPERADMIN only, which made the UI narrower
  // than the API — a manager could call the endpoints but not see the pages
  // that call them, so the fence was in the wrong place and told them
  // nothing. Each page below still enforces its own `meta.permission`, and
  // each endpoint its own check (rbac.middleware.js); this only decides
  // whether the door opens at all.
  if (to.meta.admin && !auth.canUseAdminApp) {
    return { name: 'forbidden' }
  }

  // The company-wide dashboard answers 403 to anyone who is scoped — the
  // cached payload covers every employee, which is exactly what their
  // session is fenced away from. Send them to their team's instead of
  // letting the page load and fail.
  if (to.name === 'admin-dashboard' && auth.isScoped) {
    return { name: 'admin-team-dashboard' }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' }
  }

  return true
})

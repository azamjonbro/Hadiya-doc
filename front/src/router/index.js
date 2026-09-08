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

  // /bos is SUPERADMIN only. The path being unguessable is not a control, so
  // this check is the control: ADMIN and MANAGER are refused here exactly like
  // an ordinary employee. Their session survives — they are told no, not
  // signed out.
  //
  // This guards the admin *UI*. It is not a substitute for the per-endpoint
  // permission checks on the API, which still apply to every request the pages
  // make (rbac.middleware.js).
  if (to.meta.admin && !auth.isSuperAdmin) {
    return { name: 'forbidden' }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' }
  }

  return true
})

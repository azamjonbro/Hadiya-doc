import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UnauthorizedView from '@/views/UnauthorizedView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import CoursesView from '@/views/CoursesView.vue'
import CourseDetailView from '@/views/CourseDetailView.vue'
import VideoPlayerView from '@/views/VideoPlayerView.vue'
import AssessmentView from '@/views/AssessmentView.vue'
import VideoQuizView from '@/views/VideoQuizView.vue'
import NewsView from '@/views/NewsView.vue'
import NewsDetailView from '@/views/NewsDetailView.vue'
import TasksView from '@/views/TasksView.vue'
import EventsView from '@/views/EventsView.vue'
import LeaderboardView from '@/views/LeaderboardView.vue'
import ChatView from '@/views/ChatView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import SettingsView from '@/views/SettingsView.vue'

// The admin area, formerly its own SPA on its own hostname. Same bundle now,
// kept in its own folder and behind its own shell so the two sets of pages
// don't blur into each other. Route names carry an `admin-` prefix because a
// dozen of them (dashboard, courses-list, settings, ...) exist on both sides.
import AdminShell from '@/admin/layouts/AppShell.vue'
import AdminHomeView from '@/admin/views/HomeView.vue'
import AdminUsersListView from '@/admin/views/UsersListView.vue'
import AdminUserDetailView from '@/admin/views/UserDetailView.vue'
import AdminGroupsListView from '@/admin/views/GroupsListView.vue'
import AdminGroupDetailView from '@/admin/views/GroupDetailView.vue'
import AdminLeaderboardView from '@/admin/views/LeaderboardView.vue'
import AdminCoursesListView from '@/admin/views/CoursesListView.vue'
import AdminCourseBuilderView from '@/admin/views/CourseBuilderView.vue'
import AdminCourseDetailView from '@/admin/views/CourseDetailView.vue'
import AdminNewsListView from '@/admin/views/NewsListView.vue'
import AdminNewsDetailView from '@/admin/views/NewsDetailView.vue'
import AdminTasksListView from '@/admin/views/TasksListView.vue'
import AdminReportsView from '@/admin/views/ReportsView.vue'
import AdminChatInboxView from '@/admin/views/ChatInboxView.vue'
import AdminTrashView from '@/admin/views/TrashView.vue'
import AdminNotificationsView from '@/admin/views/NotificationsView.vue'
import AdminSettingsView from '@/admin/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/403', name: 'forbidden', component: ForbiddenView, meta: { public: true } },
    { path: '/401', name: 'unauthorized', component: UnauthorizedView, meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'dashboard', component: HomeView, meta: { titleKey: 'nav.dashboard' } },
        { path: 'courses', name: 'courses-list', component: CoursesView, meta: { titleKey: 'nav.courses' } },
        { path: 'courses/:id', name: 'course-detail', component: CourseDetailView, meta: { titleKey: 'courses.title' } },
        { path: 'videos/:id', name: 'video-detail', component: VideoPlayerView, meta: { titleKey: 'nav.courses' } },
        {
          path: 'videos/:id/quiz',
          name: 'video-quiz',
          component: VideoQuizView,
          meta: { titleKey: 'nav.courses' },
        },
        {
          path: 'assessments/:id',
          name: 'assessment-detail',
          component: AssessmentView,
          meta: { titleKey: 'nav.courses' },
        },
        { path: 'news', name: 'news-list', component: NewsView, meta: { titleKey: 'nav.news' } },
        { path: 'news/:id', name: 'news-detail', component: NewsDetailView, meta: { titleKey: 'nav.news' } },
        { path: 'tasks', name: 'tasks-list', component: TasksView, meta: { titleKey: 'nav.tasks', permission: 'task:read:own' } },
        { path: 'events', name: 'events-list', component: EventsView, meta: { titleKey: 'nav.events', permission: 'event:read' } },
        { path: 'leaderboard', name: 'leaderboard', component: LeaderboardView, meta: { titleKey: 'nav.leaderboard' } },
        { path: 'chat', name: 'chat', component: ChatView, meta: { titleKey: 'nav.chat' } },
        { path: 'notifications', name: 'notifications', component: NotificationsView, meta: { titleKey: 'nav.notifications' } },
        { path: 'settings', name: 'settings', component: SettingsView, meta: { titleKey: 'nav.settings' } },
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
        { path: '', name: 'admin-dashboard', component: AdminHomeView, meta: { titleKey: 'nav.dashboard' } },
        {
          path: 'users',
          name: 'admin-users-list',
          component: AdminUsersListView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'users/:id',
          name: 'admin-user-detail',
          component: AdminUserDetailView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'groups',
          name: 'admin-groups-list',
          component: AdminGroupsListView,
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'groups/:id',
          name: 'admin-group-detail',
          component: AdminGroupDetailView,
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'leaderboard',
          name: 'admin-leaderboard',
          component: AdminLeaderboardView,
          meta: { permission: 'analytics:view:all', titleKey: 'nav.leaderboard' },
        },
        {
          path: 'courses',
          name: 'admin-courses-list',
          component: AdminCoursesListView,
          meta: { permission: 'course:read', titleKey: 'admin.nav.courses' },
        },
        {
          path: 'courses/new',
          name: 'admin-course-builder',
          component: AdminCourseBuilderView,
          meta: { permission: 'course:create', titleKey: 'courseBuilder.title' },
        },
        {
          path: 'courses/:id',
          name: 'admin-course-detail',
          component: AdminCourseDetailView,
          meta: { permission: 'course:read', titleKey: 'admin.nav.courses' },
        },
        {
          path: 'news',
          name: 'admin-news-list',
          component: AdminNewsListView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'news/:id',
          name: 'admin-news-detail',
          component: AdminNewsDetailView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'tasks',
          name: 'admin-tasks-list',
          component: AdminTasksListView,
          meta: { permission: 'task:create', titleKey: 'nav.tasks' },
        },
        {
          path: 'reports',
          name: 'admin-reports',
          component: AdminReportsView,
          meta: { permission: 'report:export', titleKey: 'nav.reports' },
        },
        {
          path: 'chat',
          name: 'admin-chat-inbox',
          component: AdminChatInboxView,
          meta: { permission: 'chat:support', titleKey: 'nav.chat' },
        },
        {
          path: 'trash',
          name: 'admin-trash',
          component: AdminTrashView,
          meta: { permission: 'course:delete', titleKey: 'nav.trash' },
        },
        {
          path: 'notifications',
          name: 'admin-notifications',
          component: AdminNotificationsView,
          meta: { titleKey: 'nav.notifications' },
        },
        { path: 'settings', name: 'admin-settings', component: AdminSettingsView, meta: { titleKey: 'nav.settings' } },
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
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
})

// Where a signed-in user belongs when they land on /login or finish signing in.
// ADMIN and MANAGER go to the employee side now: the admin panel is SUPERADMIN
// only, so sending them to a page they would be bounced off is worse than
// useless.
export function homeRouteFor(auth) {
  return auth.isSuperAdmin ? { name: 'admin-dashboard' } : { name: 'dashboard' }
}

router.beforeEach((to) => {
  const auth = useAuthStore()

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

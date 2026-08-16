import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UnauthorizedView from '@/views/UnauthorizedView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import UsersListView from '@/views/UsersListView.vue'
import UserDetailView from '@/views/UserDetailView.vue'
import GroupsListView from '@/views/GroupsListView.vue'
import GroupDetailView from '@/views/GroupDetailView.vue'
import LeaderboardView from '@/views/LeaderboardView.vue'
import CoursesListView from '@/views/CoursesListView.vue'
import CourseDetailView from '@/views/CourseDetailView.vue'
import CourseBuilderView from '@/views/CourseBuilderView.vue'
import NewsListView from '@/views/NewsListView.vue'
import NewsDetailView from '@/views/NewsDetailView.vue'
import TasksListView from '@/views/TasksListView.vue'
import ReportsView from '@/views/ReportsView.vue'
import TrashView from '@/views/TrashView.vue'
import ChatInboxView from '@/views/ChatInboxView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import SettingsView from '@/views/SettingsView.vue'

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
        {
          path: 'admin/users',
          name: 'users-list',
          component: UsersListView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'admin/users/:id',
          name: 'user-detail',
          component: UserDetailView,
          meta: { permission: 'user:read', titleKey: 'nav.employees' },
        },
        {
          path: 'admin/groups',
          name: 'groups-list',
          component: GroupsListView,
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'admin/groups/:id',
          name: 'group-detail',
          component: GroupDetailView,
          meta: { permission: 'user:read', titleKey: 'nav.groups' },
        },
        {
          path: 'admin/leaderboard',
          name: 'leaderboard',
          component: LeaderboardView,
          meta: { permission: 'analytics:view:all', titleKey: 'nav.leaderboard' },
        },
        {
          path: 'admin/courses',
          name: 'courses-list',
          component: CoursesListView,
          meta: { permission: 'course:read', titleKey: 'nav.courses' },
        },
        {
          path: 'admin/courses/new',
          name: 'course-builder',
          component: CourseBuilderView,
          meta: { permission: 'course:create', titleKey: 'courseBuilder.title' },
        },
        {
          path: 'admin/courses/:id',
          name: 'course-detail',
          component: CourseDetailView,
          meta: { permission: 'course:read', titleKey: 'nav.courses' },
        },
        {
          path: 'admin/news',
          name: 'news-list',
          component: NewsListView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'admin/news/:id',
          name: 'news-detail',
          component: NewsDetailView,
          meta: { permission: 'news:read', titleKey: 'nav.news' },
        },
        {
          path: 'admin/tasks',
          name: 'tasks-list',
          component: TasksListView,
          meta: { permission: 'task:create', titleKey: 'nav.tasks' },
        },
        {
          path: 'admin/reports',
          name: 'reports',
          component: ReportsView,
          meta: { permission: 'report:export', titleKey: 'nav.reports' },
        },
        {
          path: 'admin/chat',
          name: 'chat-inbox',
          component: ChatInboxView,
          meta: { permission: 'chat:support', titleKey: 'nav.chat' },
        },
        {
          path: 'admin/trash',
          name: 'trash',
          component: TrashView,
          meta: { permission: 'course:delete', titleKey: 'nav.trash' },
        },
        { path: 'notifications', name: 'notifications', component: NotificationsView, meta: { titleKey: 'nav.notifications' } },
        { path: 'settings', name: 'settings', component: SettingsView, meta: { titleKey: 'nav.settings' } },
      ],
    },
    // Deliberately NOT public. A signed-in admin who mistypes a URL should see
    // the 404; a signed-out visitor should see the login form, not a dead end
    // with nothing to click. The guard below tells the two apart.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated && auth.canUseAdminApp) {
      return { name: 'dashboard' }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    // No `redirect` for a URL that matches nothing: carrying it would send the
    // admin straight back to the 404 the moment they finish signing in.
    if (to.name === 'not-found') return { name: 'login' }
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // The admin app is only for SUPERADMIN/ADMIN/MANAGER — everyone else uses
  // front/. Re-logging in won't change their role, but sending them to the
  // login page (rather than stranding them on a dead-end 403) lets them sign
  // back in with an account that does have admin access.
  if (!auth.canUseAdminApp) {
    auth.clearSession()
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' }
  }

  return true
})
